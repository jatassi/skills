var REQUIRED = "^22.22.2 || ^24.15.0 || >=26";
function supported(version) {
  var parts = String(version).replace(/^v/, "").split(".");
  var major = Number(parts[0]);
  var minor = Number(parts[1]);
  var patch = Number(parts[2]);
  if (major === 22) return minor > 22 || minor === 22 && patch >= 2;
  if (major === 24) return minor >= 15;
  return major >= 26;
}
if (!supported(process.versions.node)) {
  process.stderr.write(
    "visual-grilling needs Node " + REQUIRED + ", but found " + process.versions.node + ".\nInstall a supported Node version and run the command again.\n"
  );
  process.exit(1);
} else {
  import("./lib/cli-main.mjs").then(
    function(main) {
      return main.run(process.argv.slice(2), import.meta.url);
    }
  ).then(
    function(code) {
      process.exitCode = code;
    },
    function(error) {
      process.stderr.write("visual-grilling: " + (error && error.stack ? error.stack : error) + "\n");
      process.exitCode = 1;
    }
  );
}
