import { useEffect } from 'react';

const AdUnit = ({ 
  slot, 
  format = 'auto', 
  responsive = true,
  style = { display: 'block', textAlign: 'center', margin: '20px 0' }
}) => {
  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error('AdSense error:', e);
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={style}
      data-ad-client="ca-pub-8830477337853124"
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={responsive}
    />
  );
};

export default AdUnit;
