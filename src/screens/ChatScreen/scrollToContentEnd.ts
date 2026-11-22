import type { FlatList } from 'react-native';

/** The native scroll view under a FlatList, as far as this module needs it. */
type NativeScrollView = { scrollToEnd?: (options: { animated: boolean }) => void };

/** The content height a layout reported, and the height of the list that shows it. */
export type ContentExtent = { contentHeight: number; listHeight: number };

/**
 * Brings a chat list to the end of its laid-out content.
 *
 * FlatList.scrollToEnd works the end out from the row heights measured so far; when a chat opens none are
 * measured yet, so it scrolls to offset 0, the oldest message. With an extent (the content height of the
 * latest layout and the list height) the offset is computed from that layout instead. Without one, the
 * native scroll view works the end out from its own content size.
 */
export const scrollToContentEnd = (
  list: FlatList | null | undefined,
  animated: boolean,
  extent?: ContentExtent,
): void => {
  if (!list) return;
  if (extent && extent.listHeight > 0) {
    list.scrollToOffset({ offset: Math.max(0, extent.contentHeight - extent.listHeight), animated });
    return;
  }
  const scrollView = list.getNativeScrollRef() as NativeScrollView | null | undefined;
  scrollView?.scrollToEnd?.({ animated });
};
