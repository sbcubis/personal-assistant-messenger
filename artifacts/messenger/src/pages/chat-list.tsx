import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useListAssistants,
  useToggleAssistantPin,
  useDeleteAssistant,
  useSearchAssistants,
  getListAssistantsQueryKey,
} from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/date-utils";
import { Search, Plus, Pin, MessageSquare, Trash2, Archive, Check, CheckCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { SwipeableRow } from "@/components/SwipeableRow";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export default function ChatList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: assistants, isLoading } = useListAssistants();
  const { data: searchResults } = useSearchAssistants(
    { q: searchQuery },
    { query: { enabled: searchQuery.length > 1 } }
  );

  const togglePin = useToggleAssistantPin({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAssistantsQueryKey() }) },
  });

  const deleteAssistant = useDeleteAssistant({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAssistantsQueryKey() }) },
  });

  const pinnedAssistants = assistants?.filter(a => a.isPinned) ?? [];
  const unpinnedAssistants = assistants?.filter(a => !a.isPinned) ?? [];
  const displayAssistants =
    searchQuery.length > 1
      ? (searchResults?.assistants ?? [])
      : [...pinnedAssistants, ...unpinnedAssistants];

  const showSearch = searchFocused || searchQuery.length > 0;

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* ── Header ── */}
      <header className="bg-primary text-primary-foreground px-4 pt-10 pb-3 shrink-0 z-10 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <h1 className="text-xl font-semibold tracking-wide">WhatsApp</h1>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full text-primary-foreground hover:bg-white/10 w-9 h-9"
              onClick={() => setLocation("/new")}
            >
              <Plus className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search"
            className="w-full pl-9 pr-4 h-9 bg-card text-foreground border-0 rounded-lg text-[15px] placeholder:text-muted-foreground focus-visible:ring-0"
          />
        </div>
      </header>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto bg-card">
        {isLoading && searchQuery.length === 0 ? (
          <div>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center px-4 py-3 gap-3 border-b border-border">
                <Skeleton className="w-12 h-12 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                  <Skeleton className="h-3.5 w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : displayAssistants.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-4">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center">
              <MessageSquare className="w-9 h-9 text-muted-foreground/50" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-1">
                {searchQuery ? "No results" : "No assistants yet"}
              </h2>
              <p className="text-muted-foreground text-[14px]">
                {searchQuery
                  ? "Try a different search term."
                  : "Tap + to create your first AI assistant."}
              </p>
            </div>
            {!searchQuery && (
              <Button
                onClick={() => setLocation("/new")}
                className="rounded-full px-8 bg-primary text-primary-foreground"
              >
                Create Assistant
              </Button>
            )}
          </div>
        ) : (
          <div>
            {displayAssistants.map((assistant, idx) => (
              <ContextMenu key={assistant.id}>
                <ContextMenuTrigger asChild>
                  <SwipeableRow
                    onClick={() => setLocation(`/chat/${assistant.id}`)}
                    rightActions={[
                      {
                        label: assistant.isPinned ? "Unpin" : "Pin",
                        icon: <Pin className="w-5 h-5" />,
                        color: "swipe-action-pin",
                        onTrigger: () => togglePin.mutate({ id: assistant.id }),
                      },
                      {
                        label: "Delete",
                        icon: <Trash2 className="w-5 h-5" />,
                        color: "swipe-action-delete",
                        onTrigger: () => {
                          if (window.confirm(`Delete ${assistant.name}?`))
                            deleteAssistant.mutate({ id: assistant.id });
                        },
                      },
                    ]}
                  >
                    <div
                      className={`flex items-center px-4 py-3 gap-3 bg-card active:bg-muted transition-colors ${
                        idx < displayAssistants.length - 1 ? "border-b border-border" : ""
                      }`}
                    >
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <Avatar className="w-12 h-12">
                          {assistant.avatarUrl && (
                            <AvatarImage src={assistant.avatarUrl} alt={assistant.name} />
                          )}
                          <AvatarFallback className="text-xl bg-muted">
                            {assistant.avatarEmoji || assistant.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {/* Online-style indicator */}
                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-primary border-2 border-card" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-[16px] text-foreground truncate flex items-center gap-1">
                            {assistant.name}
                            {assistant.isPinned && (
                              <Pin className="w-3 h-3 text-muted-foreground rotate-45 shrink-0" />
                            )}
                          </span>
                          <span className="text-[12px] text-muted-foreground whitespace-nowrap shrink-0">
                            {formatRelativeTime(assistant.lastMessageAt || assistant.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-0.5 gap-2">
                          <p className="text-[14px] text-muted-foreground truncate leading-snug">
                            {assistant.lastMessagePreview || (
                              <span className="italic">Start a conversation…</span>
                            )}
                          </p>
                          {/* Unread badge — show when there's a preview (treated as unread until opened) */}
                          {assistant.messageCount != null && assistant.messageCount > 0 && !assistant.lastMessagePreview?.startsWith("You:") && (
                            <span className="shrink-0 bg-primary text-primary-foreground text-[11px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                              {assistant.messageCount > 99 ? "99+" : assistant.messageCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </SwipeableRow>
                </ContextMenuTrigger>

                {/* Long-press / right-click context menu */}
                <ContextMenuContent className="w-52 rounded-xl">
                  <ContextMenuItem onClick={() => setLocation(`/chat/${assistant.id}`)}>
                    <MessageSquare className="w-4 h-4 mr-2" /> Open Chat
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => togglePin.mutate({ id: assistant.id })}>
                    <Pin className="w-4 h-4 mr-2" />
                    {assistant.isPinned ? "Unpin" : "Pin"}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => setLocation(`/edit/${assistant.id}`)}>
                    Edit Assistant
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    onClick={() => {
                      if (window.confirm(`Delete ${assistant.name}?`))
                        deleteAssistant.mutate({ id: assistant.id });
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}

            {/* Message search results */}
            {searchQuery.length > 1 && searchResults?.messages && searchResults.messages.length > 0 && (
              <div className="mt-2">
                <p className="px-4 py-2 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Messages
                </p>
                {searchResults.messages.map(msg => (
                  <div
                    key={msg.id}
                    className="flex items-center px-4 py-3 gap-3 border-b border-border cursor-pointer active:bg-muted"
                    onClick={() => setLocation(`/chat/${msg.assistantId}`)}
                  >
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <MessageSquare className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold text-[15px] truncate">{msg.assistantName}</span>
                        <span className="text-[12px] text-muted-foreground whitespace-nowrap shrink-0">
                          {formatRelativeTime(msg.createdAt)}
                        </span>
                      </div>
                      <p className="text-[13px] text-muted-foreground truncate">{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── FAB (new chat) ── */}
      <button
        className="absolute bottom-6 right-5 w-14 h-14 rounded-full bg-primary shadow-lg flex items-center justify-center active:scale-95 transition-transform z-20"
        onClick={() => setLocation("/new")}
        aria-label="New assistant"
      >
        <MessageSquare className="w-6 h-6 text-primary-foreground" />
      </button>
    </div>
  );
}
