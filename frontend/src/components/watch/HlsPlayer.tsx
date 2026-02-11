'use client';

import React, { useRef, useEffect, useState } from 'react';
import Hls from 'hls.js';

export interface HlsPlayerProps {
  manifestUrl: string;
  className?: string;
  poster?: string;
}

export function HlsPlayer({ manifestUrl, className = '', poster }: HlsPlayerProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !manifestUrl) return;

    setError(null);

    const isNativeHls =
      video.canPlayType('application/vnd.apple.mpegurl') !== '' ||
      (video.canPlayType('application/x-mpegURL') !== '' && !Hls.isSupported());

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsRef.current = hls;

      hls.loadSource(manifestUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setError(null);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError('Network error loading video. Retrying…');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError('Media error. Recovering…');
              hls.recoverMediaError();
              break;
            default:
              setError('Playback error.');
              hls.destroy();
          }
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (isNativeHls) {
      video.src = manifestUrl;
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

    setError('HLS is not supported in this browser.');
    return undefined;
  }, [manifestUrl]);

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center bg-black text-gray-400 ${className}`}>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className={`w-full h-full object-contain bg-black ${className}`}
      controls
      playsInline
      poster={poster}
      preload="metadata"
    />
  );
}
