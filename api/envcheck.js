// api/envcheck.js — ne révèle PAS la clé, juste sa présence
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const val = process.env.ALPHA_VANTAGE_KEY || '';
  res.end(JSON.stringify({
    hasAlphaVantageKey: !!val,
    alphaKeyLength: val.length,
    vercelEnv: process.env.VERCEL_ENV || null,
    vercelRegion: process.env.VERCEL_REGION || null,
    nodeEnv: process.env.NODE_ENV || null
  }));
};
