import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../../theme';
import { createStyles } from './styles';

interface ConversationActionsSectionProps {
  onClose: () => void;
  onOpenProject?: () => void;
  onOpenGallery?: () => void;
  /** Present once the conversation has something in it to share. */
  onShareConversation?: () => void;
  onDeleteConversation?: () => void;
  conversationImageCount: number;
  activeProjectName?: string | null;
}

export const ConversationActionsSection: React.FC<ConversationActionsSectionProps> = ({
  onClose,
  onOpenProject,
  onOpenGallery,
  onShareConversation,
  onDeleteConversation,
  conversationImageCount,
  activeProjectName,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const hasActions = onOpenProject || onOpenGallery || onShareConversation || onDeleteConversation;
  if (!hasActions) {
    return null;
  }

  const handleShareConversation = () => {
    onClose();
    // The settings sheet has to be gone before the system share sheet comes up over it.
    setTimeout(onShareConversation!, 350);
  };

  const handleOpenProject = () => {
    onClose();
    setTimeout(onOpenProject!, 350);
  };

  const handleOpenGallery = () => {
    onClose();
    setTimeout(onOpenGallery!, 200);
  };

  const handleDeleteConversation = () => {
    onClose();
    setTimeout(onDeleteConversation!, 200);
  };

  return (
    <View>
      {onOpenProject && (
        <TouchableOpacity style={styles.actionRow} onPress={handleOpenProject}>
          <Icon name="folder" size={16} color={colors.textSecondary} />
          <Text style={styles.actionText}>
            Project: {activeProjectName || 'Default'}
          </Text>
          <Icon name="chevron-right" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}
      {onOpenGallery && conversationImageCount > 0 && (
        <TouchableOpacity style={styles.actionRow} onPress={handleOpenGallery}>
          <Icon name="image" size={16} color={colors.textSecondary} />
          <Text style={styles.actionText}>
            Gallery ({conversationImageCount})
          </Text>
          <Icon name="chevron-right" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}
      {onShareConversation && (
        <TouchableOpacity style={styles.actionRow} onPress={handleShareConversation} testID="share-conversation-row">
          <Icon name="share-2" size={16} color={colors.textSecondary} />
          <Text style={styles.actionText}>Share Conversation</Text>
        </TouchableOpacity>
      )}
      {onDeleteConversation && (
        <TouchableOpacity style={styles.actionRow} onPress={handleDeleteConversation}>
          <Icon name="trash-2" size={16} color={colors.error} />
          <Text style={styles.actionTextError}>Delete Conversation</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};
