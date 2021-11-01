/*
  CODING STYLE

  PLANLOFT's general coding style for JS is:

  * KNF with swapped major/minor indents
  * general indent is two spaces
  * tabs should be expanded
  * lines must not end in whitespace
  * line terminator is LF, not CRLF
  * last line should always end in LF
  * encoding is UTF-8 with no BOM
  * keywords are followed by space
  * return values are always parenthesized
  * lines are 80 columns

  API USAGE

  Specific to WATS, to make it simple for others to change:

  * synchronous calls only
  * no callbacks

  Generally though, for JS we use TypeScript with async/await, and build it
  with WATS!

  NAMING CONVENTIONS

  * imported node modules begin with mod_
  * global constants are upper case with underscores
  * other constants, variables and function names are camel case.
  * path segments end in _FILE/File, _DIR/Dir, or _LINK/Link; as appropriate
  * full paths end in _PATH/Path
  * relative paths end in _SUB_PATH/SubPath
*/
const mod_process = require('process');
const mod_child_process = require('child_process');
const mod_path = require('path');
const mod_fs = require('fs');
const WATS_JSON_FILE = 'wats.json';
const PACKAGE_JSON_FILE = 'package.json';
const TSCONFIG_JSON_FILE = 'tsconfig.json';
const DEFAULT_FILES_KEY = 'default-files';
const DEFAULT_FILES_FILTER_KEY = DEFAULT_FILES_KEY + "-filter";
const TEST_PREFIX = 'test-';
const JS_SUFFIX = '.js';
const MODULE_SUFFIX = '.mjs';
const TS_SUFFIX = '.ts';
const DECLARE_SUFFIX = '.d.ts';
const WATS_TEMPLATE = require('./template.json');
const TESTING_DIR = 'testing';
const DECLARE_DIR = 'declare';
const RUNTIME_DIR = 'runtime';
const NODE_MODULES_DIR = 'node_modules';
const UTF8 = 'UTF-8';

function defaultProcessOptions(options) {
  if (options == null) {
    options = {};
  }

  if (typeof(options) === 'string') {
    options = { cwd: options };
  }

  if (options.stdio == null) {
    options.stdio = ['inherit', 'inherit', 'inherit'];
  }

  return (options);
}

/**
 * Invoke the given command with the provided args.  This
 * uses the first argument as the options object or if it is a
 * string builds an options object with that as the current working
 * directory string. If the options.stdio is not set, will
 * set them to this process's fds.
 */
function invokeCommandIn(options, command, ...args) {
  options = defaultProcessOptions(options);

  var result = mod_child_process.spawnSync(command, args, options);
  var failure = result.error;

  if (failure != null) {
    failure.exitCode = 1;
  }
  else if (result.signal != null) {
    failure = new Error("invoked command was killed with " + result.signal);
    failure.exitCode = 128 + result.signal;
  }
  else if (result.status == null) {
    failure = new Error("invoked command terminated strangely");
    failure.exitCode = 1;
  }
  else if (result.status != 0) {
    failure = new Error("invoked command terminated with status: " +
      result.status);
    failure.exitCode = result.status;
  }

  if (failure != null) {
    throw failure;
  }

  return (result);
}

function unlinkPath(path) {
  var stat;

  try {
    stat = mod_fs.lstatSync(path);
  }
  catch (e) {
    if (e.code === 'ENOENT') {
      return; // ignore
    }
    else {
      throw e;
    }
  }

  if (stat.isDirectory()) {
    for (var sub of mod_fs.readdirSync(path, UTF8)) {
      if ((sub === ".") || (sub === "..")) {
        throw new Error("unexpected directory entry: " + sub + " in " + path);
      }

      unlinkPath(mod_path.join(path, sub));
    }

    mod_fs.rmdirSync(path);
  }
  else {
    mod_fs.unlinkSync(path);
  }
}

function readCommandIn(options, command, ...args) {
  options = defaultProcessOptions(options);
  options.stdio[1] = 'pipe';

  var child = invokeCommandIn(options, command, ...args);

  return (child.stdout);
}

function modificationTimeOf(filePath) {
  return (mod_fs.statSync(filePath).mtime.getTime());
}

function restoreTimestampsOf(path, stats) {
  mod_fs.utimesSync(path, stats.atime, stats.mtime);
}

function isFileNewerThan(timestamp, filePath) {
  return (timestamp < modificationTimeOf(filePath));
}

function findAncestorFileIn(dirPath, file, fail) {
  var result = null;
  var path;

  do {
    path = mod_path.resolve(dirPath, file);

    try {
      mod_fs.statSync(path);
    }
    catch (e) {
      const parent = mod_path.resolve(dirPath, "..");

      if (parent === dirPath) {
        throw new Error("Cannot find " + file + " in scope: " + fail + ".");
      }

      dirPath = parent;
      path =  null;
    }
  }
  while (path === null);

  return (path);
}

function toJSON(o) {
  return (JSON.stringify(o, null, 2) + "\n");
}

function readUTF8File(path) {
  return (mod_fs.readFileSync(path, { encoding: UTF8 }));
}

function readJSONFile(path) {
  return (JSON.parse(readUTF8File(path)));
}

function writeUTF8File(path, text) {
  mod_fs.writeFileSync(path, text, { encoding: UTF8 });
}

function writeJSONFile(path, o) {
  writeUTF8File(path, toJSON(o));
}

function resolvePathIn(dirPath, ...path) {
  return (mod_path.resolve(dirPath, mod_path.join(...path)));
}

function cloneJSON(o) {
  return (JSON.parse(JSON.stringify(o)));
}

/**
 * Write the source over the target.
 */
function mergeJSON(target, source) {
  if (typeof(target) !== "object") {
    throw new Error("illegal argument");
  }

  if (typeof(source) !== "object") {
    throw new Error("illegal argument");
  }

  for (var name in source) {
    if (name in target) {
      if (typeof(source[name]) !== typeof(target[name])) {
        throw new Error("incompatible overwrite " + name);
      }

      if (typeof(source[name]) === "object") {
        mergeJSON(target[name], source[name]);
      }
      else {
        target[name] = cloneJSON(source[name]);
      }
    }
    else {
      target[name] = cloneJSON(source[name]);
    }
  }
}

function complainJSON(stack, complaints, message, should) {
  complaints.push(message + " at " + stack.join(" ") + " should be " +
    JSON.stringify(should));

  return (complaints);
}

/**
 * Ensure the source is in the target.
 *
 * TODO this should really be improved with better traceback and corner cases
 */
function requireJSON(stack, complaints, source, target) {
  if (typeof(source[i]) !== typeof(target[i])) {
    complaints = complainJSON(stack, complaints, "different types");
  }
  else if ((target instanceof Array) && (source instanceof Array)) {
    stack.push("["); // ] fence match

    if (target.length != source.length) {
      complaints = complainJSON(stack, complaints, "different length array",
        target);
    }
    else {
      for (var i = 0; i < source.length; i++) {
        stack.push(i);

        complaints = requireJSON(stack, complaints, source[i], target[i]);

        stack.pop();
      }
    }

    stack.pop();
  }
  else if (typeof(source) !== 'object') {
    if (source !== target) {
      complaints = complainJSON(stack, complaints, "different values",
        target);
    }
  }
  else {
    stack.push("{"); // } fence match

    for (var name in target) {
      stack.push("\"" + name + "\":");

      if (!(name in source)) {
        complaints = complainJSON(stack, complaints, "missing property",
          target[name]);
      }
      else {
        complaints = requireJSON(stack, complaints, source[name], target[name]);
      }

      stack.pop();
    }

    stack.pop();
  }

  return (complaints);
}

function throwFailure(exitCode, ...message) {
  var error = new Error(message.join(" "));

  error.exitCode = exitCode;

  throw error;
}

const MAIN_WRAPPER = readUTF8File(require.resolve('./wats-main.js'));

function main(scena) {
  var currentPath = scena.cwd;
  var args = scena.args;
  var moduleOnly = false;
  var localOnly = false;
  var stages = { 'config': true, 'build': true, 'test': true };

  while (args.length && args[0].startsWith("-")) {
    var arg = args.shift();

    switch (arg) {
      case "-l":
      case "--local-only":
        moduleOnly = true;
        localOnly = true;
        break;
      case "-m":
      case "--module-only":
        moduleOnly = true;
        break;
      case "-b":
      case "--build":
        stages = { 'config': true, 'build': true };
        break;
      case "-t":
      case "--tidy":
        stages = { 'config': true, 'build': true, 'tidy': true };
        break;
      case "-C":
      case "--config":
        stages = { 'config': true };
        break;
      case "-M":
      case "--main":
        stages.main = true;
        break;
      default:
        throw new Error("unsupported option: " + arg);
    }
  }

  var invokePath;

  if (!args.length) {
    invokePath = currentPath;
  }
  else {
    invokePath = mod_path.resolve(currentPath, args.shift());
  }

  var invokeTesting = (mod_path.basename(invokePath) === TESTING_DIR);

  if ('main' in stages) {
    if (invokeTesting) {
      var failure = new Error("The --main option is automatic" +
        " for testing.");

      failure.exitCode = 64;

      throw failure;
    }
  }
  else if (args.length && !invokeTesting) {
    var failure = new Error("Use the --main option to invoke a module" +
      " with arguments.");

    failure.exitCode = 64;

    throw failure;
  }

  /**
   * A map of canonical paths to internal config objects.
   * A config is only processed once, so this map is used
   * to determine if it has started configuring or building yet.
   */
  const configMap = {};
  // Look for a wats.json file in the hierarchy from . up.
  const watsJSONPath = findAncestorFileIn(invokePath, WATS_JSON_FILE,
    "create one containing {} in a directory above your typescript module(s)");
  const basePath = mod_path.dirname(watsJSONPath);

  function reportRelative(somePath) {
    return ("+/" + mod_path.relative(basePath, somePath));
  }

  console.log("Found", mod_path.relative(currentPath, watsJSONPath),
    "(marks development root '+/').");

  // Read it in.
  const watsJSON = readJSONFile(watsJSONPath);

  if (basePath === invokePath) {
    // This has at least made sure that the wats.json file parses ...
    // but apart from that, we have nothing to do.
    var failure = new Error("In base of development tree: doing nothing.");

    failure.exitCode = 1;

    throw failure;
  }

  // Copy in some properties from the template if they are missing.
  for (var key of [
      'generate-git-ignore',
      'generate-svn-ignore',
      DEFAULT_FILES_KEY,
      DEFAULT_FILES_FILTER_KEY]) {
    if (!(key in watsJSON)) {
      if (!(key in WATS_TEMPLATE)) {
        throw new Error("expected template.json value for " + key);
      }

      watsJSON[key] = cloneJSON(WATS_TEMPLATE[key]);
    }
  }

  const defaultFiles = watsJSON[DEFAULT_FILES_KEY];

  /*
    For the default tsconfig.json file, we assume that if the author
    of the wats.json provided anything, it should be used, with no
    overrides; otherwise we fallback to the default.  There are still
    overrides later that will reverse ineligible defaults when the
    tsconfig.json files are initialized and maintained.
  */
  if (TSCONFIG_JSON_FILE in defaultFiles) {
    // keep it as is
  }
  else {
    defaultFiles[TSCONFIG_JSON_FILE] = WATS_TEMPLATE[DEFAULT_FILES_KEY]
      [TSCONFIG_JSON_FILE];
  }

  /*
    Its a little different for the package.json file: what we want to do
    here is keep the order of the properties set in the template, but
    otherwise override with the defaults from the wats.json file, so that
    author-provided changes are listed after the important header information
    (placeholders in the template.json retain order for filled fields too).
  */
  const watsPackageJSON = cloneJSON(WATS_TEMPLATE[DEFAULT_FILES_KEY]
    [PACKAGE_JSON_FILE]);

  mergeJSON(watsPackageJSON, defaultFiles[PACKAGE_JSON_FILE]);

  defaultFiles[PACKAGE_JSON_FILE] = watsPackageJSON;

  if (!('dependencies' in defaultFiles[PACKAGE_JSON_FILE])) {
    defaultFiles[PACKAGE_JSON_FILE].dependencies = {};
  }

  function ensureJSON(sourcePath, source, target) {
    var complaints = requireJSON([], [], source, target);

    if (complaints.length > 0) {
      var relativePath = reportRelative(sourcePath);

      for (var complaint of complaints) {
        console.log(relativePath, complaint);
      }

      var failure = new Error("Failed due to properties mismatch in '" +
        sourcePath + "'.");

      failure.exitCode = 1;

      throw failure;
    }
  }

  function filterJSONMatch(expression, contents) {
    var result = true;

    if (typeof(expression) !== typeof(contents)) {
      result = false;
    }
    else if (typeof(expression) !== 'object') {
      result = (expression === contents);
    }
    else if (expression instanceof Array) {
      if (!(contents instanceof Array)) {
        result = false;
      }
      else {
        for (var left of expression) {
          result = false;

          for (var right of contents) {
            if (filterJSONMatch(left, right)) {
              result = true;
              break;
            }
          }

          if (!result) {
            break;
          }
        }
      }
    }
    else {
      for (var key in expression) {
        if (!(key in contents)) {
          result = false;
          break;
        }

        if (expression[key] === true) {
          // that's as far as we go - presence
        }
        else if (!filterJSONMatch(expression[key], contents[key])) {
          result = false;
          break;
        }
      }
    }

    return (result);
  }

  function filterDefaultFilesIn(modulePath) {
    var filters = watsJSON[DEFAULT_FILES_FILTER_KEY];

    if ((typeof(filters) != "object") || (filters instanceof Array)) {
      throwFailure(1, reportRelative(watsJSONPath) + "#" +
        DEFAULT_FILES_FILTER_KEY, "value", "should be a JSON map, not " +
        filters);
    }

    var result = true;

    for (var subPath in filters) {
      var filterPath = resolvePathIn(modulePath, subPath);

      if (!mod_fs.existsSync(filterPath)) {
        result = false;
        break;
      }

      var filterJSON = readJSONFile(filterPath);

      if (!filterJSONMatch(filters[subPath], filterJSON)) {
        result = false;
        break;
      }
    }

    return (result);
  }

  function configModuleIn(modulePath, name, testing, moduleConfig) {
    if (modulePath in configMap) {
      return (configMap[modulePath]);
    }

    console.log("Visiting", reportRelative(modulePath),
      testing ? "..." : "module ...");

    const config = {
        modulePath: modulePath,
        name: name,
        testing: testing,
        execName: (testing ? TEST_PREFIX : "") + name,
        changed: false, // true when this config is out of date
        localDependencies: [], // a list of local modulePath dependents
        allDependencies: [], // a list of recursive local dependents
      };
    configMap[modulePath] = config;

    const baseSubPath = mod_path.relative(basePath, modulePath);
    const tsFile = config.execName + TS_SUFFIX;
    const tsPath = resolvePathIn(modulePath, tsFile);

    config.tsFile = tsFile;
    config.baseSubPath = baseSubPath;

    if (!mod_fs.existsSync(tsPath)) {
      console.log("Could not find main", baseSubPath,
        "module file", reportRelative(tsPath));
      process.exit(1);
    }

    if (moduleOnly && (modulePath !== currentPath) &&
        (!testing || (mod_path.relative(modulePath, "..") !== currentPath))) {
      // assume it has all been built and is available
    }
    else if (localOnly && (modulePath !== currentPath)) {
      // assume it has all been built and is available
    }
    else {
      const tsConfigJSONPath = resolvePathIn(modulePath, TSCONFIG_JSON_FILE);
      var tsConfigJSON;
      var requiredTSConfigJSON = {
          compilerOptions: {
            incremental: false,
            composite: false,
            outDir: "./" + RUNTIME_DIR,
            rootDir: "./",
            rootDirs: [ "./" ],
            baseUrl: "./",
            moduleResolution: "node",
            resolveJsonModule: true,
            sourceMap: true,
          },
          include: [ "./**/*" + TS_SUFFIX ],
        };

      if (testing) {
        mergeJSON(requiredTSConfigJSON, {
            compilerOptions: {
              declaration: false,
              paths: {},
            },
            exclude: [
              "./" + RUNTIME_DIR,
            ]
          });

        requiredTSConfigJSON.compilerOptions.paths[name] = [
            "../" + DECLARE_DIR + "/" + name + DECLARE_SUFFIX,
          ];
      }
      else {
        mergeJSON(requiredTSConfigJSON, {
            compilerOptions: {
              declaration: true,
              declarationDir: "./" + DECLARE_DIR,
              declarationMap: true,
            },
            exclude: [
              "./" + RUNTIME_DIR,
              "./" + DECLARE_DIR,
              "./" + TESTING_DIR,
            ]
          });
      }

      if (!mod_fs.existsSync(tsConfigJSONPath)) {
        console.log("Generating missing", reportRelative(tsConfigJSONPath),
          "to maintain.");

        tsConfigJSON = cloneJSON(watsJSON[DEFAULT_FILES_KEY]
          [TSCONFIG_JSON_FILE]);

        mergeJSON(tsConfigJSON, requiredTSConfigJSON);

        writeJSONFile(tsConfigJSONPath, tsConfigJSON);
      }
      else {
        tsConfigJSON = readJSONFile(tsConfigJSONPath);

        ensureJSON(tsConfigJSONPath, tsConfigJSON, requiredTSConfigJSON);
      }

      const savedTSConfigJSONText = toJSON(tsConfigJSON);

      config.runtimeJSSubPath = mod_path.join(RUNTIME_DIR,
        config.execName + JS_SUFFIX),
      config.runtimeMJSSubPath = mod_path.join(RUNTIME_DIR,
        config.execName + MODULE_SUFFIX);
      config.declareDTSSubPath = mod_path.join(DECLARE_DIR,
        config.execName + DECLARE_SUFFIX);
      config.tsConfigJSONPath = tsConfigJSONPath;
      config.tsConfigJSON = tsConfigJSON;

      const packageJSONPath = resolvePathIn(modulePath, PACKAGE_JSON_FILE);
      var packageJSON;
      var requiredPackageJSON = {
          name: name,
          type: "module",
          main: config.runtimeMJSSubPath,
        };

      if (!testing) {
        requiredPackageJSON["types"] = config.declareDTSSubPath;
      }

      if (!mod_fs.existsSync(packageJSONPath)) {
        console.log("Generating missing", reportRelative(packageJSONPath),
          "this time only.");

        packageJSON = cloneJSON(watsJSON[DEFAULT_FILES_KEY][PACKAGE_JSON_FILE]);

        mergeJSON(packageJSON, requiredPackageJSON);

        writeJSONFile(packageJSONPath, packageJSON);

        config.changed = true;
      }
      else {
        packageJSON = readJSONFile(packageJSONPath);

        var packageJSONChanged = false;

        for (var key of ["main", "types"]) {
          if (!(key in packageJSON) && (key in requiredPackageJSON)) {
            packageJSON[key] = requiredPackageJSON[key]

            console.log("Editing", reportRelative(packageJSONPath),
              "to add", key, "property.");

            packageJSONChanged = true;
          }
        }

        if (testing) {
          // Remove "types" from testing packages - they are not intended
          // for invocation from typescript and the types won't be generated.
          for (var key of ["types"]) {
            if (key in packageJSON) {
              console.log("Editing", reportRelative(packageJSONPath),
                "to remove", key, "property.");

              packageJSONChanged = true;
            }
          }
        }

        ensureJSON(packageJSONPath, packageJSON, requiredPackageJSON);

        if (packageJSONChanged) {
          writeJSONFile(packageJSONPath, packageJSON);
          config.changed = true;
        }
      }

      if (testing) {
        // ignore
      }
      else if (!filterDefaultFilesIn(modulePath)) {
        console.log("Skipping", DEFAULT_FILES_KEY, "checks for",
          reportRelative(modulePath), "because it doesn't pass",
          DEFAULT_FILES_FILTER_KEY, "(usually intended).");
      }
      else {
        for (var subPath in defaultFiles) {
          if (subPath === PACKAGE_JSON_FILE) {
            // special
          }
          else if (subPath === TSCONFIG_JSON_FILE) {
            // special
          }
          else {
            var filePath = resolvePathIn(modulePath, subPath);
            var template = defaultFiles[subPath];
            var sourcePath = undefined;
            var buffer;

            if (typeof(template) === "string") {
              sourcePath = resolvePathIn(basePath, template);

              buffer = mod_fs.readFileSync(sourcePath);
            }
            else if (typeof(template) !== "object") {
              throw new Error("don't know how to generate from " +
                JSON.stringify(template));
            }
            else if (template instanceof Array) {
              buffer = Buffer.from(template.join("\n") + "\n", UTF8);
            }
            else {
              buffer = Buffer.from(toJSON(template), UTF8);
            }

            var current;

            if (mod_fs.existsSync(filePath) &&
                (current = mod_fs.readFileSync(filePath)) &&
                current.equals(buffer)) {
              // do nothing
            }
            else if (current === undefined) {
              mod_fs.writeFileSync(filePath, buffer);

              if (sourcePath === undefined) {
                console.log("Generating", reportRelative(filePath),
                  "from", reportRelative(watsJSONPath),
                  "defaultFiles", subPath, "inline template.");
              }
              else {
                console.log("Generating", reportRelative(filePath),
                  "from", reportRelative(watsJSONPath),
                  "defaultFiles", subPath, "template", sourcePath, "file.");
              }
            }
            else {
              console.log("Note", reportRelative(filePath),
                "differs from", reportRelative(watsJSONPath),
                "defaultFiles", subPath, "template",
                sourcePath ? "file " + reportRelative(sourcePath) + "." :
                "inline.");
            }
          }
        }
      }

      var gitIgnorePath = resolvePathIn(modulePath, ".gitignore");
      var gitIgnoreDefault = "/" + NODE_MODULES_DIR + "\n";

      if (watsJSON['generate-git-ignore']) {
        if (!mod_fs.existsSync(gitIgnorePath)) {
          console.log("Generating missing", reportRelative(gitIgnorePath),
            "this time only.");

          writeUTF8File(gitIgnorePath, gitIgnoreDefault);
        }
      }

      if (!testing) {
        var npmIgnorePath = resolvePathIn(modulePath, ".npmignore");

        if (!mod_fs.existsSync(npmIgnorePath)) {
          var basis;

          if (!mod_fs.existsSync(gitIgnorePath)) {
            basis = readUTF8File(gitIgnorePath);
          }
          else {
            basis = gitIgnoreDefault;
          }

          if (!basis.endsWith("\n")) {
            basis += "\n";
          }

          console.log("Generating missing", reportRelative(npmIgnorePath),
            "this time only.");

          writeUTF8File(npmIgnorePath, basis + "/" + TESTING_DIR + "\n");
        }
      }

      if (watsJSON['generate-svn-ignore']) {
        try {
          invokeCommandIn({
              cwd: modulePath,
              encoding: UTF8,
              stdio: [ 0, 'ignore', 'ignore'],
            },
            "svn", "propget",
            "svn:ignore", ".");
          // If its there, we don't touch it.
        }
        catch (e) {
          if (e.exitCode == null) {
            throw e;
          }

          try {
            console.log("Altering", reportRelative(modulePath), "svn:ignore");
            invokeCommandIn(modulePath, "svn", "propset", "svn:ignore",
              NODE_MODULES_DIR + "\n", ".");
          }
          catch (e) {
            console.log("Possibly not added to svn.  Igoring for now.");
          }
        }
      }

      if (packageJSON.dependencies != null) {
        /*
          Process dependencies so that they are linked into our modified
          tsconfig.json and from the node_modules dir.
         */
        const nodeModulesPath = resolvePathIn(modulePath, NODE_MODULES_DIR);

        // We always like this to be present for building ...
        if (!('paths' in tsConfigJSON.compilerOptions)) {
          tsConfigJSON.compilerOptions.paths = {};
        }

        for (var depend in packageJSON.dependencies) {
          var dependBasename = mod_path.basename(depend);
          var dependVersion = packageJSON.dependencies[depend];

          // First, fix node modules.
          var dependPath = resolvePathIn(basePath, depend);

          if (!mod_fs.existsSync(nodeModulesPath)) {
            console.log("Created", reportRelative(nodeModulesPath),
              "to load/link dependencies.");
            mod_fs.mkdirSync(nodeModulesPath);
          }

          var linkPath = resolvePathIn(nodeModulesPath, depend);

          if (mod_fs.existsSync(dependPath)) {
            if (!mod_fs.existsSync(linkPath)) {
              console.log("Linking", reportRelative(linkPath),
                "for local runtime.");
              mod_fs.symlinkSync(mod_path.relative(nodeModulesPath, dependPath),
                linkPath);
            }

            if (testing && (name === dependBasename)) {
              // handled already (publicly wired, since its within the module)
            }
            else {
              config.localDependencies.push(dependPath);
            }
          }
          else {
            if (!mod_fs.existsSync(linkPath)) {
              console.log("Installing", depend, "for local runtime.");

              invokeCommandIn(modulePath, "npm",
                "--loglevel", "error",
                "--no-package-lock",
                "--no-save", "install",
                depend + "@" + dependVersion);
            }
          }
        }
      }

      /*
        When constructing all dependencies, we like to keep the order
        consistent with the order declared (this is why we don't use maps).
        This relies on the JSON arrays being ordered, which is not always
        true, but is true in the case of file parsing here.
       */
      config.allDependencies.push(...config.localDependencies);

      if (testing) {
        // Testing code needs its containing module's dependencies to compile.
        for (var dependPath of moduleConfig.allDependencies) {
          if (config.allDependencies.indexOf(dependPath) < 0) {
            config.allDependencies.push(dependPath);
          }
        }
      }

      for (var dependPath of config.localDependencies) {
        var dependModule = configModuleIn(dependPath,
          mod_path.basename(dependPath), false);

        for (var deepPath of dependModule.allDependencies) {
          if (config.allDependencies.indexOf(deepPath) < 0) {
            config.allDependencies.push(deepPath);
          }
        }
      }

      /*
        At this point the config.allDependencies list should contain one copy
        of each dependency path, in the order that they were first encountered
        across the tree.
       */

      for (var dependPath of config.allDependencies) {
        tsConfigJSON.compilerOptions.paths[mod_path.basename(dependPath)] = [
            mod_path.relative(modulePath, mod_path.join(dependPath,
            DECLARE_DIR, mod_path.basename(dependPath) + DECLARE_SUFFIX)),
          ];
      }

      if (savedTSConfigJSONText !== toJSON(tsConfigJSON)) {
        console.log("Editing", reportRelative(tsConfigJSONPath),
          "for building ...");
        writeJSONFile(tsConfigJSONPath, tsConfigJSON);
      }

      var runtimeMJSPath = resolvePathIn(modulePath, config.runtimeMJSSubPath);
      var declareTSPath = resolvePathIn(modulePath, DECLARE_DIR,
        name + DECLARE_SUFFIX);

      if (!mod_fs.existsSync(runtimeMJSPath)) {
        // need to build
      }
      else if (!testing && !mod_fs.existsSync(declareTSPath)) {
        // need to build
      }
      else {
        var lastBuilt = modificationTimeOf(runtimeMJSPath);

        if (isFileNewerThan(lastBuilt, tsPath)) {
          // need to build
        }
        else if (isFileNewerThan(lastBuilt, tsConfigJSONPath)) {
          // need to build
        }
        else if (isFileNewerThan(lastBuilt, packageJSONPath)) {
          // need to build
        }
        else if ((() => {
              for (var dependPath of config.allDependencies) {
                if (configMap[dependPath].changed > lastBuilt) {
                  return (true);
                }
              }

              return (false);
            })()) {
          // need to rebuild
        }
        else {
          config.built = lastBuilt;

          if (testing) {
            config.changed = config.built;
          }
          else {
            config.changed = modificationTimeOf(declareTSPath);
          }
        }
      }
    }

    const testingPath = resolvePathIn(modulePath, TESTING_DIR);

    if ((name !== TESTING_DIR) && mod_fs.existsSync(testingPath)) {
      config.testingConfig = configModuleIn(testingPath, name, true, config);
    }

    return (config);
  }

  function visitModuleIn(modulePath) {
    const name = mod_path.basename(modulePath);
    var config;
    var testing;

    if (name === TESTING_DIR) {
      const parent = mod_path.dirname(modulePath);

      if (parent === basePath) {
        console.log("Don't know how to make testing here."); // TODO
        mod_process.exit(1);
      }

      config = visitModuleIn(parent, mod_path.basename(modulePath)).
        testingConfig;

      testing = true;
    }
    else {
      config = configModuleIn(modulePath, name, false);
      testing = false;
    }

    for (var dependPath of config.localDependencies) {
      visitModuleIn(dependPath);
    }

    if (!('build' in stages)) {
      // skip building
    }
    else if (moduleOnly && (modulePath !== currentPath)) {
      // skip building
    }
    else if (localOnly && (modulePath !== currentPath)) {
      // skip building
    }
    else if (!config.built) {
      if (config.building) {
        throw new Error("dependency loop"); // TODO explain
      }

      config.building = true;

      console.log("Building", reportRelative(modulePath), "module ...");

      const runtimeMJSPath = resolvePathIn(modulePath,
        config.runtimeMJSSubPath);
      const runtimeJSPath = resolvePathIn(modulePath,
        config.runtimeJSSubPath);
      const declareTSPath = resolvePathIn(modulePath,
        DECLARE_DIR, config.name + DECLARE_SUFFIX);
      var declareTSText = null;
      var declareTSStats = null;

      if (!testing) {
        try {
          declareTSText = readUTF8File(declareTSPath);
          declareTSStats = mod_fs.statSync(declareTSPath);
        }
        catch (e) {
          // ignore, we don't care if its missing
        }
      }

      try {
        invokeCommandIn(modulePath, "tsc");
      }
      catch (e) {
        /*
          When it fails to compile, we remove all of the generated code,
          but we restore the old declaration files if they existed.  We
          don't touch the map files.  The point behind all this is that
          once the compilation mistakes are fixed, if the d.ts file hasn't
          changed the dependents won't be rebuilt.
         */
        for (var filePath of [runtimeJSPath, runtimeMJSPath, declareTSPath]) {
          try {
            mod_fs.unlinkSync(filePath);
          }
          catch (e0) {
            // ignore e0 - its expected here
          }
        }

        if ((declareTSText != null) && (declareTSStats != null)) {
          // overwrite prior and restore dates
          writeUTF8File(declareTSPath, declareTSText);
          restoreTimestampsOf(declareTSPath, declareTSStats);
        }

        throw e;
      }

      mod_fs.renameSync(runtimeJSPath, runtimeMJSPath);

      if ((declareTSText != null) && (declareTSStats != null) &&
          (readUTF8File(declareTSPath) === declareTSText)) {
        // File hasn't actually changed, so restore its timestamps.
        restoreTimestampsOf(declareTSPath, declareTSStats);
      }

      config.built = modificationTimeOf(runtimeMJSPath);

      if (!testing) {
        config.changed = modificationTimeOf(declareTSPath);
      }
      else {
        config.changed = config.built;
      }

      config.building = false;
    }

    if (!('tidy' in stages)) {
      // skip tidy
    }
    else {
      // by reference
      const paths = config.tsConfigJSON.compilerOptions.paths || {};
      var changed = false;

      for (var dependPath of config.allDependencies) {
        const dependConfig = configMap[dependPath];
        const entry = paths[dependConfig.name] || [];
        const candidate = mod_path.relative(modulePath,
          mod_path.join(dependPath, DECLARE_DIR, dependConfig.name +
          DECLARE_SUFFIX));
        var index;

        while ((index = entry.indexOf(candidate)) >= 0) {
          entry.splice(index, 1);
          changed = true;
        }

        if (entry.length === 0) {
          delete paths[dependConfig.name];
          changed = true;
        }
      }

      if (changed) {
        console.log("Tidying", reportRelative(config.tsConfigJSONPath),
          "for committing.");
        writeJSONFile(config.tsConfigJSONPath, config.tsConfigJSON);
      }
    }

    if (!testing) {
      // skip testing
    }
    else if (!('test' in stages)) {
      // skip testing
    }
    else {
      console.log("Testing", reportRelative(modulePath), "module ...");
      invokeCommandIn(modulePath, "node", "--enable-source-maps",
        "--input-type=module", "-e", MAIN_WRAPPER,
        './' + config.runtimeMJSSubPath); // @todo fix fix fix
    }

    return (config);
  }

  var invokeConfig = visitModuleIn(invokePath);

  if ('main' in stages) {
    console.log("Running", reportRelative(invokePath), "module ...");
    invokeCommandIn(currentPath, "node", "--enable-source-maps",
      "--input-type=module", "-e", MAIN_WRAPPER,
      mod_path.resolve(invokePath, invokeConfig.runtimeMJSSubPath), ...args);
  }
  else if ('test' in stages) {
  }
  else {
    // we're done
  }
}

module.exports.unlinkPath = unlinkPath;
module.exports.main = main;
module.exports.modificationTimeOf = modificationTimeOf;
