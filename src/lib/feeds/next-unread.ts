/** Feed na ordem da barra lateral, com contagem de não lidos. */
export type UnreadFeed = { feedId: string; unread: number };

/** Pastas na ordem da sidebar, depois os feeds sem pasta. */
export function orderedSidebarFeeds(data: {
  folders: { subscriptions: UnreadFeed[] }[];
  unfiled: UnreadFeed[];
}): UnreadFeed[] {
  return [...data.folders.flatMap((folder) => folder.subscriptions), ...data.unfiled];
}

/**
 * Próximo feed com não lidos depois do atual, na ordem da sidebar.
 * Dá a volta na lista e ignora o feed corrente.
 */
export function nextUnreadFeedId(feeds: UnreadFeed[], currentFeedId: string): string | null {
  const n = feeds.length;
  if (n === 0) return null;
  const start = feeds.findIndex((feed) => feed.feedId === currentFeedId);
  const from = start === -1 ? 0 : start + 1;
  for (let i = 0; i < n; i++) {
    const feed = feeds[(from + i) % n];
    if (feed.unread > 0 && feed.feedId !== currentFeedId) return feed.feedId;
  }
  return null;
}
