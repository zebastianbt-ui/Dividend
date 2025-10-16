module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const a = process.env.ALPHA_VANTAGE_KEY || '';
  const b = process.env.AV_KEY || '';
  res.end(JSON.stringify({
    has_AV_KEY: !!b, AV_KEY_len: b.length,
    has_ALPHA_VANTAGE_KEY: !!a, ALPHA_len: a.length,
    alpha_startsWith: a ? a.slice(0,4) : null,
    alpha_endsWith: a ? a.slice(-4) : null,
    vercelEnv: process.env.VERCEL_ENV || null
  }));
};
