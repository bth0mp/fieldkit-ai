import React from 'react';
import { Modal, type ModalProps } from 'react-native';
import { useAuthStore } from '../stores/authStore';

/**
 * React Native's Modal, hidden while the app lock is showing.
 *
 * Every Modal is its own Android window, so a dialog that was open when the app locked, or one that opens
 * while it is locked (an error from a reply that fails behind the lock), would sit above the lock screen
 * with its buttons usable. The app's dialogs use this instead of Modal; only the lock screen's own Modal
 * uses React Native's directly.
 */
export interface LockAwareModalProps extends ModalProps {
  /** The dialog belongs to the lock screen itself (a wrong-passphrase message), so it shows over the lock. */
  overLock?: boolean;
}

export const LockAwareModal: React.FC<LockAwareModalProps> = ({ visible, overLock = false, ...rest }) => {
  const lockShowing = useAuthStore(state => state.isEnabled && state.isLocked);
  return <Modal {...rest} visible={!!visible && (overLock || !lockShowing)} />;
};
