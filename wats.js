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
const UTF8 = "UTF-8";

function modificationTimeOf(filePath) {
  return (mod_fs.statSync(filePath).mtime.getTime());
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

function readJSONFile(path) {
  return (JSON.parse(mod_fs.readFileSync(path, { encoding: UTF8 })));
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

/**
 * Ensure the source is in the target.
 *
 * TODO this should really be improved with better traceback and corner cases
 */
function requireJSON(target, source) {
  if ((target instanceof Array) && (source instanceof Array)) {
    if (target.length != source.length) {
      throw new Error("different length array");
    }

    for (var i = 0; i < source.length; i++) {
      if (typeof(source[i]) !== typeof(target[i])) {
        throw new Error("different index type at " + i);
      }

      if (source[i] instanceof Array) {
        requireJSON(target[i], source[i]);
      }
      else if (typeof(source[i]) === "object") {
        requireJSON(target[i], source[i]);
      }
      else if (source[i] !== target[i]) {
        throw new Error("different index value at " + i);
      }
      else {
        // OK
      }
    }
  }
  else {
    if (typeof(target) !== "object") {
      throw new Error("illegal argument");
    }

    if (typeof(source) !== "object") {
      throw new Error("illegal argument");
    }

    for (var name in source) {
      if (!(name in target)) {
        throw new Error("missing field " + name);
      }

      if (typeof(source[name]) !== typeof(target[name])) {
        throw new Error("incompatible field " + name);
      }

      if (source[name] instanceof Array) {
        requireJSON(target[name], source[name]);
      }
      else if (typeof(source[name]) === "object") {
        requireJSON(target[name], source[name]);
      }
      else if (target[name] !== source[name]) {
        throw new Error("different field " + name);
      }
      else {
        // OK
      }
    }
  }
}

function executeIn(currentPath, ...args) {
  var moduleOnly = false;
  var localOnly = false;
  var stages = { "config": true, "build": true, "test": true };

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
        stages = { "config": true, "build": true };
        break;
      case "-t":
      case "--tidy":
        stages = { "config": true, "build": true, "tidy": true };
        break;
      case "-C":
      case "--config":
        stages = { "config": true };
        break;
      default:
        throw new Error("unsupported option: " + arg);
    }
  }

  /**
    * A map of canonical paths to internal config objects.
    * A config is only processed once, so this map is used
    * to determine if it has started configuring or building yet.
    */
  const configMap = {};
  // Look for a wats.json file in the hierarchy from . up.
  const watsJSONPath = findAncestorFileIn(currentPath, WATS_JSON_FILE,
    "create one containing {} in a directory above your typescript module(s)");
  const basePath = mod_path.dirname(watsJSONPath);

  console.log("Found", watsJSONPath, "for base and defaults.");

  // Read it in.
  const watsJSON = readJSONFile(watsJSONPath);

  // Copy in simple properties from the template if they are missing.
  for (var key of ["generate-git-ignore"]) {
    if (!(key in watsJSON)) {
      if (!(key in WATS_TEMPLATE)) {
        throw new Error("expected template.json value for " + key);
      }

      watsJSON[key] = WATS_TEMPLATE[key];
    }
  }

  if (!("defaultFiles" in watsJSON)) {
    watsJSON.defaultFiles = {};
  }

  // If it doesn't have default package.json content, give it a template.
  if (!('defaultFiles["package.json"]' in watsJSON)) {
    watsJSON.defaultFiles["package.json"] =
      cloneJSON(WATS_TEMPLATE.defaultFiles["package.json"]);
  }

  // If it doesn't have default tsconfig.json content, give it a template.
  if (!('defaultFiles["tsconfig.json"]' in watsJSON)) {
    watsJSON.defaultFiles["tsconfig.json"] =
      cloneJSON(WATS_TEMPLATE.defaultFiles["tsconfig.json"]);
  }

  if (basePath === currentPath) {
    console.log("In base of development tree: doing nothing.");
    mod_process.exit(1);
  }

  function configModuleIn(modulePath, name, testing) {
    if (modulePath in configMap) {
      return (configMap[modulePath]);
    }

    console.log("Visiting", modulePath, testing ? "..." : "module ...");

    const config = {
        modulePath: modulePath,
        name: name,
        testing: testing,
        execName: (testing ? TEST_PREFIX : "") + name,
        changed: false, // true when this config is out of date
        depends: [], // a list of modulePath strings dependent upon
      };
    configMap[modulePath] = config;

    const baseSubPath = mod_path.relative(basePath, modulePath);
    const tsFile = config.execName + TS_SUFFIX;
    const tsPath = resolvePathIn(modulePath, tsFile);

    config.tsFile = tsFile;
    config.baseSubPath = baseSubPath;

    if (!mod_fs.existsSync(tsPath)) {
      console.log("Could not find main", baseSubPath, "module file", tsPath);
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
        console.log("Generating missing", tsConfigJSONPath, "this time only.");

        tsConfigJSON = cloneJSON(watsJSON.defaultFiles["tsconfig.json"]);

        mergeJSON(tsConfigJSON, requiredTSConfigJSON);

        writeJSONFile(tsConfigJSONPath, tsConfigJSON);
      }
      else {
        tsConfigJSON = readJSONFile(tsConfigJSONPath);

        requireJSON(tsConfigJSON, requiredTSConfigJSON);
      }

      const savedTSConfigJSONText = JSON.stringify(tsConfigJSON);

      config.runtimeJSSubPath = mod_path.join(RUNTIME_DIR,
        config.execName + JS_SUFFIX),
      config.runtimeMJSSubPath = mod_path.join(RUNTIME_DIR,
        config.execName + MODULE_SUFFIX);
      config.tsConfigJSONPath = tsConfigJSONPath;
      config.tsConfigJSON = tsConfigJSON;

      const packageJSONPath = resolvePathIn(modulePath, PACKAGE_JSON_FILE);
      var packageJSON;
      var requiredPackageJSON = {
          name: name,
          type: "module",
          main: config.runtimeMJSSubPath,
        };

      if (!mod_fs.existsSync(packageJSONPath)) {
        console.log("Generating missing", packageJSONPath, "this time only.");

        packageJSON = cloneJSON(watsJSON.defaultFiles["package.json"]);

        mergeJSON(packageJSON, requiredPackageJSON);

        writeJSONFile(packageJSONPath, packageJSON);

        config.changed = true;
      }
      else {
        packageJSON = readJSONFile(packageJSONPath);

        requireJSON(packageJSON, requiredPackageJSON);
      }

      if (watsJSON["generate-git-ignore"]) {
        var gitIgnorePath = resolvePathIn(modulePath, ".gitignore");

        if (!mod_fs.existsSync(gitIgnorePath)) {
          console.log("Generating missing", gitIgnorePath, "this time only.");

          writeUTF8File(gitIgnorePath,
            "/node_modules");
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
          let dependBasename = mod_path.basename(depend);

          // First, fix node modules.
          var dependPath = resolvePathIn(basePath, depend);

          if (!mod_fs.existsSync(nodeModulesPath)) {
            console.log("Created", nodeModulesPath,
              "to load/link dependencies.");
            mod_fs.mkdirSync(nodeModulesPath);
          }

          var linkPath = resolvePathIn(nodeModulesPath, depend);

          if (mod_fs.existsSync(dependPath)) {
            if (!mod_fs.existsSync(linkPath)) {
              console.log("Linking", linkPath, "for local runtime.");
              mod_fs.symlinkSync(mod_path.relative(nodeModulesPath, dependPath),
                linkPath);
            }

            if (testing && (name === dependBasename)) {
              // handled already (publicly wired, since its within the module)
            }
            else {
              tsConfigJSON.compilerOptions.paths[depend] = [
                  mod_path.relative(modulePath, mod_path.join(dependPath,
                    DECLARE_DIR, dependBasename + DECLARE_SUFFIX)),
                ];
              config.depends.push(dependPath);
            }
          }
          else {
            if (!mod_fs.existsSync(linkPath)) {
              console.log("Installing", depend, "for local runtime.");

              mod_child_process.spawnSync("env", [
                  "npm",
                  "--loglevel", "error",
                  "--package-lock", "false",
                  "install",
                  depend + "@" + packageJSON.dependencies[depend],
                ],
                {
                  cwd: modulePath,
                  stdio: [0, 1, 2],
                });
            }
          }
        }
      }

      for (var dependPath of config.depends) {
        configModuleIn(dependPath, mod_path.basename(dependPath), false);
      }

      if (savedTSConfigJSONText !== JSON.stringify(tsConfigJSON)) {
        console.log("Editing", tsConfigJSONPath, "for building ...");
        writeJSONFile(tsConfigJSONPath, tsConfigJSON);
      }

      var runtimeMJSPath = resolvePathIn(modulePath, config.runtimeMJSSubPath);

      if (!mod_fs.existsSync(runtimeMJSPath)) {
        // need to build
      }
      else {
        var timestamp = modificationTimeOf(runtimeMJSPath);

        if (isFileNewerThan(timestamp, tsPath)) {
          // need to build
        }
        else if (isFileNewerThan(timestamp, tsConfigJSONPath)) {
          // need to build
        }
        else if (isFileNewerThan(timestamp, packageJSONPath)) {
          // need to build
        }
        else if ((() => {
              for (var dependPath of config.depends) {
                if (configMap[dependPath].built > timestamp) {
                  return (true);
                }
              }

              return (false);
            })()) {
          // need to rebuild
        }
        else {
          config.built = timestamp;
        }
      }
    }

    const testingPath = resolvePathIn(modulePath, TESTING_DIR);

    if ((name !== TESTING_DIR) && mod_fs.existsSync(testingPath)) {
      config.testingConfig = configModuleIn(testingPath, name, true);
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

    for (var dependPath of config.depends) {
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

      console.log("Building", modulePath, "module ...");

      mod_child_process.spawnSync("env", [
          "tsc",
        ],
        {
          cwd: modulePath,
          stdio: [0, 1, 2],
        });
      const runtimeMJSPath = resolvePathIn(modulePath,
        config.runtimeMJSSubPath);
      mod_fs.renameSync(resolvePathIn(modulePath, config.runtimeJSSubPath),
        runtimeMJSPath);

      config.building = false;
      config.built = modificationTimeOf(runtimeMJSPath);
    }

    if (!('tidy' in stages)) {
      // skip tidy
    }
    else {
      // by reference
      const paths = config.tsConfigJSON.compilerOptions.paths || {};
      var changed = false;

      for (var depend of config.depends) {
        const dependConfig = configMap[depend];
        const entry = paths[dependConfig.name] || [];
        const candidate = mod_path.relative(modulePath,
          mod_path.join(depend, DECLARE_DIR, dependConfig.name +
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
        console.log("Tidying", config.tsConfigJSONPath, "for committing.");
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
      console.log("Testing", modulePath, "module ...");
      mod_child_process.spawnSync("env", [
          "node",
          "--input-type=module",
          "-e",
          "import { test } from './" + config.runtimeMJSSubPath + "';\n" +
          "test()",
        ],
        {
          cwd: modulePath,
          stdio: [0, 1, 2],
        });
    }

    return (config);
  }

  visitModuleIn(currentPath);
}

module.exports.executeIn = executeIn;
