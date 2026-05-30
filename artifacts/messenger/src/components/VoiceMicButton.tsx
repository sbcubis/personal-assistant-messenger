import { useRef, useState, useCallback } from "react";
import { Mic, X } from "lucide-react";

interface VoiceMicButtonProps {
  onRecordingComplete: (blob: Blob) => void;
  disabled?: boolean;
}

type RecordState = "idle" | "tap-recording" | "hold-recording" | "cancelling";

export function VoiceMicButton({ onRecordingComplete, disabled }: VoiceMicButtonProps) {
  const [state, setState] = useState<RecordState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [cancelProgress, setCancelProgress] = useState(0); // 0–1

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPointerX = useRef(0);
  const isCancelledRef = useRef(false);
  const stateRef = useRef<RecordState>("idle");

  const updateState = (s: RecordState) => {
    stateRef.current = s;
    setState(s);
  };

  const startTimer = () => {
    setRecordingSeconds(0);
    timerRef.current = setInterval(() => {
      setRecordingSeconds(s => s + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      isCancelledRef.current = false;
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (!isCancelledRef.current && chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
          onRecordingComplete(blob);
        }
        chunksRef.current = [];
      };
      mr.start();
      mediaRecorderRef.current = mr;
      startTimer();
    } catch {
      updateState("idle");
    }
  };

  const stopAndSend = useCallback(() => {
    stopTimer();
    isCancelledRef.current = false;
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    updateState("idle");
    setRecordingSeconds(0);
    setCancelProgress(0);
  }, []);

  const cancelRecording = useCallback(() => {
    stopTimer();
    isCancelledRef.current = true;
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    updateState("idle");
    setRecordingSeconds(0);
    setCancelProgress(0);
  }, []);

  // Tap-to-toggle behaviour
  const handleClick = useCallback(async () => {
    if (disabled) return;
    if (stateRef.current === "idle") {
      updateState("tap-recording");
      await startRecording();
    } else if (stateRef.current === "tap-recording") {
      stopAndSend();
    }
  }, [disabled, stopAndSend]);

  // Hold behaviour
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled || stateRef.current !== "idle") return;
    startPointerX.current = e.clientX;
    holdTimerRef.current = setTimeout(async () => {
      holdTimerRef.current = null;
      updateState("hold-recording");
      await startRecording();
    }, 200);
  }, [disabled]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (stateRef.current !== "hold-recording") return;
    const dx = startPointerX.current - e.clientX; // positive = swiped left
    const progress = Math.min(1, Math.max(0, dx / 120));
    setCancelProgress(progress);
    if (progress > 0.3) updateState("cancelling");
    else if (stateRef.current === "cancelling") updateState("hold-recording");
  }, []);

  const handlePointerUp = useCallback(() => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (stateRef.current === "hold-recording") {
      stopAndSend();
    } else if (stateRef.current === "cancelling") {
      cancelRecording();
    }
  }, [stopAndSend, cancelRecording]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const isRecording = state === "tap-recording" || state === "hold-recording" || state === "cancelling";

  if (isRecording) {
    return (
      <div className="flex-1 flex items-center justify-between bg-destructive/5 border border-destructive/20 rounded-3xl px-4 h-[50px]">
        {/* Cancel hint / progress */}
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <X className="w-4 h-4" />
          <span className={state === "cancelling" ? "text-destructive font-medium" : ""}>
            {state === "cancelling" ? "Release to cancel" : "← Slide to cancel"}
          </span>
        </div>

        {/* Timer + pulse */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-destructive font-mono text-sm font-medium">{formatTime(recordingSeconds)}</span>

          {/* Stop/send button */}
          {state === "tap-recording" ? (
            <button
              className="w-10 h-10 rounded-full bg-destructive flex items-center justify-center ml-2"
              onClick={stopAndSend}
            >
              <div className="w-4 h-4 bg-white rounded-sm" />
            </button>
          ) : (
            <button
              className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center ml-2 touch-none"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <Mic className="w-5 h-5 text-destructive" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <button
      className="w-[50px] h-[50px] shrink-0 rounded-full bg-primary flex items-center justify-center shadow-sm active:scale-95 transition-transform touch-none"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      disabled={disabled}
      aria-label="Record voice message"
    >
      <Mic className="w-5 h-5 text-primary-foreground" />
    </button>
  );
}
