// cli.mjs: checks the Node version before anything else.
//
// Keep this file to syntax that old Node can parse (no optional chaining, no
// `??`, no class fields, no top-level await): everything newer lives in the
// dynamically imported main module, which is only parsed after the check.

var REQUIRED = '^22.22.2 || ^24.15.0 || >=26';

function supported(version) {
  var parts = String(version).replace(/^v/, '').split('.');
  var major = Number(parts[0]);
  var minor = Number(parts[1]);
  var patch = Number(parts[2]);
  if (major === 22) return minor > 22 || (minor === 22 && patch >= 2);
  if (major === 24) return minor >= 15;
  return major >= 26;
}

if (!supported(process.versions.node)) {
  process.stderr.write(
    'visual-grilling needs Node ' + REQUIRED + ', but found ' + process.versions.node + '.\n' +
      'Install a supported Node version and run the command again.\n'
  );
  process.exit(1);
} else {
  import('./lib/cli-main.mjs').then(
    function (main) {
      return main.run(process.argv.slice(2), import.meta.url);
    }
  ).then(
    function (code) {
      process.exitCode = code;
    },
    function (error) {
      process.stderr.write('visual-grilling: ' + (error && error.stack ? error.stack : error) + '\n');
      process.exitCode = 1;
    }
  );
}
