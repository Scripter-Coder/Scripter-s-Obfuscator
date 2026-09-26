
const { execSync } = require('child_process');
const fs = require('fs');
module.exports = async (page) => {
  try {
    const out = execSync('node -v', {encoding:'utf8'});
    return out;
  } catch(e) { return e.message + (e.stdout||'')+(e.stderr||'')}
};
