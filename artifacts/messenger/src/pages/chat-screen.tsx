import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import ReactMarkdown from "react-markdown";
import {
  useGetAssistant,
  useListMessages,
  useClearMessages,
  useDeleteAssistant,
  useDuplicateAssistant,
  getListMessagesQueryKey,
  getListAssistantsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft,
  MoreVertical,
  Send,
  Mic,
  Settings,
  Trash2,
  Copy,
  RefreshCcw,
  Phone,
  Video,
  Paperclip,
  X,
  Square,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ─── Streaming helper ─────────────────────────────────────── */
async function streamSSE(
  url: string,
  body: object,
  onToken: (text: string) => void,
  onDone: () => void
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.body) { onDone(); return; }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const json = JSON.parse(line.slice(6));
        if (json.content) onToken(json.content);
        if (json.done) onDone();
      } catch {}
    }
  }
  onDone();
}

/* ─── Voice recorder hook ──────────────────────────────────── */
type RecordMode = "idle" | "tap" | "hold" | "cancelling";

function useVoice(onReady: (blob: Blob) => void) {
  const [mode, setMode]     = useState<RecordMode>("idle");
  const [secs, setSecs]     = useState(0);
  const mrRef               = useRef<MediaRecorder | null>(null);
  const chunksRef           = useRef<Blob[]>([]);
  const cancelledRef        = useRef(false);
  const timerRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startXRef           = useRef(0);
  const modeRef             = useRef<RecordMode>("idle");

  const set = (m: RecordMode) => { modeRef.current = m; setMode(m); };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      cancelledRef.current = false;
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (!cancelledRef.current && chunksRef.current.length > 0)
          onReady(new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" }));
        chunksRef.current = [];
      };
      mr.start();
      mrRef.current = mr;
      setSecs(0);
      timerRef.current = setInterval(() => setSecs(s => s + 1), 1000);
    } catch { set("idle"); }
  };

  const stopAndSend = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    cancelledRef.current = false;
    mrRef.current?.stop(); mrRef.current = null;
    set("idle"); setSecs(0);
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    cancelledRef.current = true;
    mrRef.current?.stop(); mrRef.current = null;
    set("idle"); setSecs(0);
  }, []);

  /* Pointer events for the mic button */
  const onMicPointerDown = useCallback((e: React.PointerEvent) => {
    startXRef.current = e.clientX;
    holdTimerRef.current = setTimeout(async () => {
      holdTimerRef.current = null;
      set("hold");
      await startRecording();
    }, 200);
  }, []);

  const onMicPointerMove = useCallback((e: React.PointerEvent) => {
    if (modeRef.current !== "hold" && modeRef.current !== "cancelling") return;
    const dx = startXRef.current - e.clientX;
    if (dx > 80) set("cancelling"); else set("hold");
  }, []);

  const onMicPointerUp = useCallback(async () => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (modeRef.current === "hold") { stopAndSend(); return; }
    if (modeRef.current === "cancelling") { cancel(); return; }
    /* quick tap (no hold timer fired) → toggle */
    if (modeRef.current === "idle") { set("tap"); await startRecording(); }
    else if (modeRef.current === "tap") { stopAndSend(); }
  }, [stopAndSend, cancel]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return { mode, secs, fmt, stopAndSend, cancel, onMicPointerDown, onMicPointerMove, onMicPointerUp };
}

/* ─── Main component ───────────────────────────────────────── */
export default function ChatScreen() {
  const { id } = useParams();
  const assistantId = Number(id);
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  const [input, setInput]               = useState("");
  const [isStreaming, setIsStreaming]   = useState(false);
  const [streamText, setStreamText]     = useState("");

  const { data: assistant, isLoading: loadingAssistant } = useGetAssistant(assistantId);
  const { data: messages, isLoading: loadingMsgs }       = useListMessages(assistantId);

  const clearMsgs = useClearMessages({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListMessagesQueryKey(assistantId) }) },
  });
  const deleteAst = useDeleteAssistant({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListAssistantsQueryKey() }); setLocation("/"); } },
  });
  const duplicate = useDuplicateAssistant({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListAssistantsQueryKey() }) },
  });

  /* scroll to bottom on new messages */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText, isStreaming]);

  /* auto-resize textarea */
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  /* ── Send text ── */
  const sendText = useCallback(async () => {
    const msg = input.trim();
    if (!msg || isStreaming) return;
    setInput("");
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
    setIsStreaming(true);
    setStreamText("");

    qc.setQueryData(getListMessagesQueryKey(assistantId), (old: any[]) => [
      ...(old ?? []),
      { id: Date.now(), assistantId, role: "user", content: msg, createdAt: new Date().toISOString() },
    ]);

    let full = "";
    try {
      await streamSSE(
        `/api/openai/conversations/${assistantId}/messages`,
        { content: msg },
        tok => { full += tok; setStreamText(full); },
        () => {
          qc.invalidateQueries({ queryKey: getListMessagesQueryKey(assistantId) });
          qc.invalidateQueries({ queryKey: getListAssistantsQueryKey() });
        }
      );
    } finally {
      setIsStreaming(false);
      setStreamText("");
    }
  }, [input, isStreaming, assistantId, qc]);

  /* ── Send voice ── */
  const sendVoice = useCallback(async (blob: Blob) => {
    setIsStreaming(true);
    setStreamText("");
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onloadend = () => res((fr.result as string).split(",")[1]);
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });

      let full = "";
      await streamSSE(
        `/api/openai/conversations/${assistantId}/voice-messages`,
        { audio: base64 },
        tok => { full += tok; setStreamText(full); },
        () => {
          qc.invalidateQueries({ queryKey: getListMessagesQueryKey(assistantId) });
          qc.invalidateQueries({ queryKey: getListAssistantsQueryKey() });
        }
      );
    } finally {
      setIsStreaming(false);
      setStreamText("");
    }
  }, [assistantId, qc]);

  const voice = useVoice(sendVoice);
  const isVoiceActive = voice.mode !== "idle";

  if (loadingAssistant) return <div className="h-dvh bg-chat-bg" />;
  if (!assistant) return (
    <div className="h-dvh flex items-center justify-center bg-background text-muted-foreground">
      Assistant not found
    </div>
  );

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden">

      {/* ── Header ── */}
      <header className="flex items-center gap-2 px-2 py-2 bg-primary text-primary-foreground shrink-0 shadow-sm z-10">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full text-primary-foreground hover:bg-white/10 shrink-0 -ml-1"
          onClick={() => setLocation("/")}
        >
          <ChevronLeft className="w-6 h-6" />
        </Button>

        <div
          className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
          onClick={() => setLocation(`/edit/${assistant.id}`)}
        >
          <Avatar className="w-9 h-9 shrink-0">
            {assistant.avatarUrl && <AvatarImage src={assistant.avatarUrl} />}
            <AvatarFallback className="text-base bg-white/20 text-primary-foreground">
              {assistant.avatarEmoji || assistant.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-semibold text-[16px] leading-tight truncate">{assistant.name}</p>
            <p className="text-[12px] text-primary-foreground/70 leading-tight">tap to edit</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-primary-foreground hover:bg-white/10"
              >
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              <DropdownMenuItem onClick={() => setLocation(`/edit/${assistant.id}`)}>
                <Settings className="w-4 h-4 mr-2" /> Edit Assistant
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicate.mutate({ id: assistant.id })}>
                <Copy className="w-4 h-4 mr-2" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => clearMsgs.mutate({ id: assistant.id })}>
                <RefreshCcw className="w-4 h-4 mr-2" /> Clear Conversation
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                onClick={() => {
                  if (window.confirm(`Delete ${assistant.name} and all messages?`))
                    deleteAst.mutate({ id: assistant.id });
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete Assistant
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1 bg-chat-bg">
        {/* Empty state */}
        {!loadingMsgs && (messages?.length ?? 0) === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-8">
            <Avatar className="w-20 h-20">
              {assistant.avatarUrl && <AvatarImage src={assistant.avatarUrl} />}
              <AvatarFallback className="text-3xl bg-card">
                {assistant.avatarEmoji || assistant.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-lg">{assistant.name}</p>
              <p className="text-muted-foreground text-sm mt-1 max-w-[240px] leading-relaxed">
                {assistant.instructions || "Ready to assist you."}
              </p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2 text-[13px] text-yellow-800 max-w-xs text-center">
              Messages are end-to-end encrypted. Tap to start chatting.
            </div>
          </div>
        )}

        {/* Messages */}
        {messages?.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              className={`flex ${isUser ? "justify-end" : "justify-start"} px-1`}
            >
              <div
                className={`
                  relative max-w-[78%] px-3 py-2 rounded-2xl shadow-sm
                  ${isUser
                    ? "bg-bubble-out text-bubble-out-foreground rounded-tr-sm"
                    : "bg-bubble-in text-bubble-in-foreground rounded-tl-sm"
                  }
                `}
              >
                {isUser ? (
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                    {msg.content}
                  </p>
                ) : (
                  <div className="prose prose-sm max-w-none text-[15px] leading-relaxed
                    [&>p]:my-0.5 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0
                    [&>ul]:my-1 [&>ol]:my-1 [&>ul]:pl-4 [&>ol]:pl-4
                    [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm
                    [&_strong]:font-semibold [&_code]:bg-black/5 [&_code]:rounded [&_code]:px-1 [&_code]:text-[13px]">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
                {/* Timestamp */}
                <p className={`text-[11px] mt-0.5 text-right leading-none
                  ${isUser ? "text-bubble-out-foreground/50" : "text-muted-foreground/60"}`}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}

        {/* Streaming / typing indicator */}
        {isStreaming && (
          <div className="flex justify-start px-1">
            <div className="bg-bubble-in text-bubble-in-foreground rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm max-w-[78%]">
              {streamText ? (
                <div className="prose prose-sm max-w-none text-[15px] leading-relaxed
                  [&>p]:my-0.5 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
                  <ReactMarkdown>{streamText}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex gap-1 items-center h-5">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/40 typing-dot" />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/40 typing-dot" />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/40 typing-dot" />
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Composer ── */}
      <div className="shrink-0 bg-card border-t border-border px-2 py-2 pb-[max(env(safe-area-inset-bottom),8px)]">

        {/* Voice recording active bar */}
        {isVoiceActive && (
          <div className="flex items-center justify-between bg-destructive/5 border border-destructive/20 rounded-2xl px-4 h-[50px] mb-2">
            <button
              className="flex items-center gap-2 text-muted-foreground text-[14px] active:text-destructive transition-colors"
              onClick={voice.cancel}
            >
              <X className="w-4 h-4" />
              <span className={voice.mode === "cancelling" ? "text-destructive font-medium" : ""}>
                {voice.mode === "cancelling" ? "Release to cancel" : "← Slide to cancel"}
              </span>
            </button>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <span className="font-mono text-sm font-medium text-destructive">
                {voice.fmt(voice.secs)}
              </span>
              {voice.mode === "tap" && (
                <button
                  className="ml-2 w-9 h-9 rounded-full bg-destructive flex items-center justify-center active:scale-95"
                  onClick={voice.stopAndSend}
                >
                  <Square className="w-4 h-4 text-white" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Input row */}
        {!isVoiceActive && (
          <div className="flex items-end gap-2">
            {/* Attachment */}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-muted-foreground hover:text-primary shrink-0 h-10 w-10"
              onClick={() => {/* future: attachment picker */}}
            >
              <Paperclip className="w-5 h-5" />
            </Button>

            {/* Text input */}
            <div className="flex-1 flex items-end bg-card border border-border rounded-3xl px-4 py-2 min-h-[44px] focus-within:border-primary/40 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInput}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
                }}
                placeholder="Message"
                rows={1}
                className="flex-1 resize-none bg-transparent outline-none text-[16px] leading-normal placeholder:text-muted-foreground max-h-[120px] w-full"
              />
            </div>

            {/* Send / Mic */}
            {input.trim() ? (
              <Button
                size="icon"
                onClick={sendText}
                disabled={isStreaming}
                className="rounded-full bg-primary text-primary-foreground h-[44px] w-[44px] shrink-0 active:scale-95 transition-transform shadow-sm"
              >
                <Send className="w-5 h-5" />
              </Button>
            ) : (
              <button
                className="rounded-full bg-primary text-primary-foreground h-[44px] w-[44px] shrink-0 flex items-center justify-center active:scale-95 transition-transform shadow-sm touch-none select-none"
                onPointerDown={voice.onMicPointerDown}
                onPointerMove={voice.onMicPointerMove}
                onPointerUp={voice.onMicPointerUp}
                onPointerCancel={voice.onMicPointerUp}
                onContextMenu={e => e.preventDefault()}
                aria-label="Hold to record, tap to start/stop"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Hold instruction hint when recording in hold mode */}
        {voice.mode === "hold" && (
          <p className="text-center text-[12px] text-muted-foreground mt-1">
            Release to send
          </p>
        )}
      </div>
    </div>
  );
}
