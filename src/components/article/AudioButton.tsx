import { useCallback, useRef, useState } from "react";
import { Volume2 } from "lucide-react";

interface AudioButtonProps {
  src: string;
  className?: string;
}

export function AudioButton({ src, className }: AudioButtonProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const handleClick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      audio.currentTime = 0;
      setPlaying(false);
    } else {
      audio.play().catch(() => setPlaying(false));
      setPlaying(true);
    }
  }, [playing]);

  const handleEnded = useCallback(() => {
    setPlaying(false);
  }, []);

  return (
    <>
      <button
        onClick={handleClick}
        className={[
          "inline-flex items-center justify-center rounded-full p-1 text-accent transition-transform duration-[var(--duration-fast)]",
          playing ? "scale-110" : "hover:scale-110",
          className ?? "",
        ].join(" ")}
        aria-label="Play pronunciation"
      >
        <Volume2 size={18} />
      </button>
      <audio ref={audioRef} src={src} onEnded={handleEnded} preload="none" />
    </>
  );
}
