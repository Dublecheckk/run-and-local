'use client';

import { useLayoutEffect, useRef, useState } from 'react';

export default function PhonePreview() {
  const area = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.65);

  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    const fit = () =>
      setScale(
        Math.min(1, element.clientWidth / 414, element.clientHeight / 868),
      );
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <main className="phone-preview">
      <div className="preview-device-area" ref={area}>
        <div style={{ width: 414 * scale, height: 868 * scale }}>
          <div
            className="preview-device"
            style={{ transform: `scale(${scale})` }}
          >
            <div className="preview-camera" aria-hidden="true" />
            <iframe
              src="/screen"
              title="런앤로컬 휴대폰 앱"
              allow="geolocation"
            />
            <div className="preview-home-indicator" aria-hidden="true" />
          </div>
        </div>
      </div>
      <a
        className="preview-expand"
        href="/screen"
        target="_blank"
        rel="noreferrer"
      >
        크게 보기 ↗
      </a>
    </main>
  );
}
