// Verify the duration formatter produces exactly the wording that was asked
// for: "Will take around 10 seconds", "Will take around 2 hours 30 seconds",
// with minutes appearing when minutes exist.
function shFormatDuration(ms) {
    var total = Math.max(0, Math.round(ms / 1000));
    if (total < 1) return 'less than a second';
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var parts = [];
    if (h) parts.push(h + (h === 1 ? ' hour' : ' hours'));
    if (m) parts.push(m + (m === 1 ? ' minute' : ' minutes'));
    if (s && (!h || s)) parts.push(s + (s === 1 ? ' second' : ' seconds'));
    if (!parts.length) return 'less than a minute';
    return parts.join(' ');
}

const cases = [
    [10 * 1000, '10 seconds'],
    [2 * 3600 * 1000 + 30 * 1000, '2 hours 30 seconds'],
    [3600 * 1000, '1 hour'],
    [3600 * 1000 + 60 * 1000, '1 hour 1 minute'],
    [2 * 3600 * 1000 + 45 * 60 * 1000, '2 hours 45 minutes'],
    [5 * 60 * 1000, '5 minutes'],
    [65 * 1000, '1 minute 5 seconds'],
    [90 * 1000, '1 minute 30 seconds'],
    [1 * 1000, '1 second'],
    [59 * 1000, '59 seconds'],
    [60 * 1000, '1 minute'],
    [300, 'less than a second'],
    [0, 'less than a second'],
    [3 * 3600 * 1000 + 5 * 60 * 1000 + 7 * 1000, '3 hours 5 minutes 7 seconds'],
];

let pass = 0, fail = 0;
console.log('DURATION FORMATTER\n' + '-'.repeat(52));
for (const [ms, want] of cases) {
    const got = shFormatDuration(ms);
    const ok = got === want;
    if (ok) pass++; else fail++;
    console.log((ok ? '  OK   ' : '  FAIL ') + String(ms).padStart(9) + 'ms -> ' + got
        + (ok ? '' : '   (wanted: ' + want + ')'));
}

// The exact sentence the panel shows.
console.log('\nPANEL SENTENCE\n' + '-'.repeat(52));
for (const [ms, label] of [[10 * 1000, '10s'], [2 * 3600 * 1000 + 30 * 1000, '2h30s'], [45 * 60 * 1000, '45m']]) {
    console.log('  ' + label.padEnd(6) + ' Will take around ' + shFormatDuration(ms));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);