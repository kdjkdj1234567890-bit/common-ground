const qloo = require('./lib/qloo');
const sample = require('./lib/sample-data');

module.exports = (req, res) => {
  const live = qloo.hasKey();
  res.status(200).json({
    ok: true,
    mode: live ? 'live' : 'sample',
    note: live ? null : sample.SAMPLE_MODE_NOTE,
  });
};
