import { useEffect, useRef, useState } from 'react';

const AdUnit = ({ 
  slot, 
  format = 'auto', 
  responsive = true,
  style = { display: 'block', textAlign: 'center', margin: '8px 0', minHeight: 0 }
}) => {
  const adRef = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error('AdSense error:', e);
    }
  }, []);

  useEffect(() => {
    if (!adRef.current || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect?.height || 0
        if (height > 0) {
          setVisible(true)
        }
      }
    })

    observer.observe(adRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <ins
      ref={adRef}
      className="adsbygoogle"
      style={visible ? style : { ...style, margin: 0, height: 0, overflow: 'hidden' }}
      data-ad-client="ca-pub-8830477337853124"
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={responsive}
    />
  );
};

export default AdUnit;
