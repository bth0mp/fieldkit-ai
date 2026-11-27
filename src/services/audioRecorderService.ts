import { AudioRecorder, FileFormat, FileDirectory, BitDepth, IOSAudioQuality, FlacCompressionLevel } from 'react-native-audio-api';
import { PermissionsAndroid, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { audioSessionManager } from './audioSessionManager';
import logger from '../utils/logger';
import { appLockService } from './appLockService';

/** Supported formats for llama.rn audio input */
type AudioInputFormat = 'wav' | 'mp3';

/** Folder under the app's files directory that the recorder writes to (RNFS.DocumentDirectoryPath is that directory on Android). */
const RECORDINGS_SUBDIRECTORY = 'audio-input';

const plainPath = (path: string): string => path.replace(/^file:\/\//, '');

/** A file's name alone: a saved path can differ from the listed one in its folder prefix (/data/user/0 or /data/data). */
const baseName = (path: string): string => plainPath(path).split(/[?#]/)[0].split('/').pop() ?? '';

/** When this process started. A recording named for a later time is one this session made. */
const PROCESS_STARTED_AT = Date.now();

/** The time in a recorder file name (input_<ms>...), or null for any other name. */
const recordedAt = (name: string): number | null => {
  const match = /^input_(\d+)/.exec(name);
  return match ? Number(match[1]) : null;
};

class AudioRecorderService {
  private recorder: AudioRecorder | null = null;
  private isRecording = false;
  private recordingSeq = 0;

  supportsDirectAudioInput(): boolean {
    return true;
  }

  getFormat(): AudioInputFormat {
    return 'wav';
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        appLockService.openingSystemScreen();
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'This app needs microphone access for voice input.',
            buttonPositive: 'OK',
            buttonNegative: 'Cancel',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch {
        return false;
      } finally {
        appLockService.systemScreenClosed();
      }
    }
    return true; // iOS: triggered by AVAudioSession on first use
  }

  /** Starts a recording and returns its number, which grows with each one. */
  async startRecording(): Promise<number> {
    if (this.isRecording) {
      await this.stopRecording().catch(() => {});
    }
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Microphone permission denied');
    }
    // The recorder needs an active record-capable AVAudioSession. The session is
    // owned by audioSessionManager (the single owner) — it uses playAndRecord so
    // TTS playback can share it, and restores a playback session when recording
    // ends so later playback isn't left on a record session (the silent-playback bug).
    await audioSessionManager.ensureRecording();
    const rec = new AudioRecorder();
    // Whisper requires 16 kHz mono int16 PCM.
    // Set sampleRate via preset so the WAV header and data match what whisper.rn expects.
    rec.enableFileOutput({
      format: FileFormat.Wav,
      directory: FileDirectory.Document,
      subDirectory: RECORDINGS_SUBDIRECTORY,
      fileNamePrefix: `input_${Date.now()}`,
      channelCount: 1,
      preset: {
        sampleRate: 16000,
        bitDepth: BitDepth.Bit16,
        bitRate: 256000,
        iosQuality: IOSAudioQuality.High,
        flacCompressionLevel: FlacCompressionLevel.L5,
      },
    });
    this.recorder = rec;
    this.isRecording = true;
    const seq = ++this.recordingSeq;
    const startResult: any = rec.start();
    if (startResult && startResult.status && startResult.status !== 'success') {
      this.isRecording = false;
      this.recorder = null;
      // Recording never started — hand the session back to playback so it isn't
      // left stranded in record mode.
      audioSessionManager.restorePlaybackAfterRecording().catch(() => {});
      throw new Error(`Recording failed to start: ${startResult.errorMessage ?? startResult.error ?? startResult.status}`);
    }
    return seq;
  }

  async stopRecording(): Promise<{ path: string; durationSeconds: number }> {
    if (!this.isRecording || !this.recorder) {
      throw new Error('No active recording');
    }
    const result = this.recorder.stop();
    this.isRecording = false;
    this.recorder = null;
    // Hand the session back to playback so a voice note played next is audible.
    await audioSessionManager.restorePlaybackAfterRecording();
    if (result.status !== 'success') {
      throw new Error('Recording failed to save');
    }
    const path = result.path;
    const durationSeconds = (result as any).duration ?? 0;
    logger.log(`[WIRE-RECORDER] ${JSON.stringify({ platform: Platform.OS, path, durationSeconds, status: result.status })}`); // [WIRE] real recorder output (voice-note file/duration)
    return { path, durationSeconds };
  }

  /** Stops and deletes the current recording. With `seq`, only when that is still the current one. */
  cancelRecording(seq?: number): void {
    if (!this.isRecording || !this.recorder) return;
    if (seq !== undefined && seq !== this.recordingSeq) return;
    const result = this.recorder.stop();
    this.isRecording = false;
    this.recorder = null;
    // What was captured is thrown away with it.
    if (result?.status === 'success') this.discardRecording(result.path);
    // Best-effort session restore (fire-and-forget — keep this method sync).
    audioSessionManager.restorePlaybackAfterRecording().catch(() => {});
  }

  /** Delete a recording that did not become part of a message. Never throws; a missing file is fine. */
  async discardRecording(path: string): Promise<void> {
    try {
      const file = plainPath(path);
      if (await RNFS.exists(file)) await RNFS.unlink(file);
    } catch (error) {
      logger.warn('[AudioRecorder] Could not delete a recording', error);
    }
  }

  /**
   * Delete every recording in the recordings folder that is not in `keep` (the paths saved messages refer
   * to). Returns how many it deleted. Never throws; a file it cannot delete stays for the next launch.
   */
  async deleteUnusedRecordings(keep: Set<string>): Promise<number> {
    let deleted = 0;
    try {
      const folder = `${RNFS.DocumentDirectoryPath}/${RECORDINGS_SUBDIRECTORY}`;
      if (!(await RNFS.exists(folder))) return 0;
      const kept = new Set([...keep].map(baseName));
      for (const entry of await RNFS.readDir(folder)) {
        // A recording in progress is not leftover.
        if (this.isRecording) break;
        // Only a recording from before this launch can be leftover: a newer one may still become a message.
        const madeAt = recordedAt(baseName(entry.path));
        if (!entry.isFile() || kept.has(baseName(entry.path)) || madeAt === null || madeAt >= PROCESS_STARTED_AT) continue;
        try {
          await RNFS.unlink(entry.path);
          deleted += 1;
        } catch (error) {
          logger.warn('[AudioRecorder] Could not delete an old recording', error);
        }
      }
    } catch (error) {
      logger.warn('[AudioRecorder] Could not list old recordings', error);
    }
    return deleted;
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }
}

export const audioRecorderService = new AudioRecorderService();
