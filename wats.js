/*
	NAMING CONVENTIONS

	imported modules begin with mod_

	global constants are upper case with underscores

	other constants, variables and function names are camel case.

	path segments end in _FILE/File, _DIR/Dir, or _LINK/Link; as appropriate

	full paths end in _PATH/Path

	relative paths end in _SUB_PATH/SubPath
*/
const mod_process = require('process');
const mod_child_process = require('child_process');
const mod_path = require('path');
const mod_fs = require('fs');
const watsJSON_FILE = 'wats.json';
const PACKAGE_JSON_FILE = 'package.json';
const TSCONFIG_JSON_FILE = 'tsconfig.json';
const WAPS_TSCONFIG_JSON_FILE = '.waps.tsconfig.json';
const TEST_PREFIX = 'test-';
const JS_SUFFIX = '.js';
const MODULE_SUFFIX = '.mjs';
const TS_SUFFIX = '.ts';
const DECLARE_TS_SUFFIX = '.d.ts';
const WATS_TEMPLATE = require('./template.json');
const TESTING_DIR = 'testing';
const DECLARE_DIR = 'declare';
const RUNTIME_DIR = 'runtime';
const NODE_MODULES_DIR = 'node_modules';
const UTF8 = "UTF-8";

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
	/**
	 * A map of canonical paths to internal config objects.
	 * A config is only processed once, so this map is used
	 * to determine if it has started configuring or building yet.
	 */
	const configMap = {};
	// Look for a wats.json file in the hierarchy from . up.
	const watsJSONPath = findAncestorFileIn(currentPath, watsJSON_FILE,
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


	console.log(watsJSON);

	if (basePath === currentPath) {
		console.log("In base of development tree: doing nothing.");
		mod_process.exit(1);
	}

	function configModuleIn(modulePath, name, testing) {
		if (modulePath in configMap) {
			return (configMap[modulePath]);
		}

		console.log("Configuring", modulePath, testing ? "..." : "module ...");

		const config = {
				modulePath: modulePath,
				name: name,
				testing: testing,
				execName: (testing ? TEST_PREFIX : "") + name,
				changed: false, // true when this config is out of date
				depends: [], // a map of modulePath strings dependent upon
			};
		configMap[modulePath] = config;

		const relativePath = mod_path.relative(basePath, modulePath);
		const tsFile = config.execName + TS_SUFFIX;
		const tsPath = resolvePathIn(modulePath, tsFile);

		config.tsFile = tsFile;

		if (!mod_fs.existsSync(tsPath)) {
			console.log("Could not find main", relativePath, "module file", tsPath);
			process.exit(1);
		}

		const tsConfigJSONPath = resolvePathIn(modulePath, TSCONFIG_JSON_FILE);
		var tsConfigJSON;
		var requiredTSConfigJSON = {
				compilerOptions: {
					outDir: "./" + RUNTIME_DIR,
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
						paths: {}
					},
					exclude: [
						"./" + RUNTIME_DIR,
					]
				});

			requiredTSConfigJSON.compilerOptions.paths[name] = [
					"../" + DECLARE_DIR + "/" + name + DECLARE_TS_SUFFIX,
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

			config.changed = true;
		}
		else {
			tsConfigJSON = readJSONFile(tsConfigJSONPath);

			requireJSON(tsConfigJSON, requiredTSConfigJSON);
		}

		config.runtimeJSSubPath = mod_path.join(RUNTIME_DIR,
			config.execName + JS_SUFFIX),
		config.runtimeMJSSubPath = mod_path.join(RUNTIME_DIR,
			config.execName + MODULE_SUFFIX);

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

			for (var depend in packageJSON.dependencies) {
				let dependBasename = mod_path.basename(depend);

				// First, fix node modules.
				var dependPath = resolvePathIn(basePath, depend);

				if (!mod_fs.existsSync(nodeModulesPath)) {
					console.log("Created", nodeModulesPath, "to load/link dependencies.");
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
									DECLARE_DIR, dependBasename + DECLARE_TS_SUFFIX)),
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

		// TODO urgent find way to make sure we can invoke this ...
		// or just store in config?
		const wapsTSConfigJSONFile = resolvePathIn(modulePath,
			WAPS_TSCONFIG_JSON_FILE);

		writeJSONFile(wapsTSConfigJSONFile, tsConfigJSON);

		for (var dependPath of config.depends) {
			configModuleIn(dependPath, mod_path.basename(dependPath), false);
		}

		const testingPath = resolvePathIn(modulePath, TESTING_DIR);

		if ((name !== TESTING_DIR) && mod_fs.existsSync(testingPath)) {
			config.testingConfig = configModuleIn(testingPath, name, true);
		}

		return (config);
	}

	function buildModuleIn(modulePath) {
		const name = mod_path.basename(modulePath);
		let config;

		if (name === TESTING_DIR) {
			const parent = mod_path.dirname(modulePath);

			if (parent === basePath) {
				console.log("Don't know how to make testing here."); // TODO
				mod_process.exit(1);
			}

			config = buildModuleIn(parent, mod_path.basename(modulePath)).testingConfig;
		}
		else {
			config = configModuleIn(modulePath, name, false);
		}

		for (var dependPath of config.depends) {
			buildModuleIn(dependPath);
		}

		if (!config.built) {
			config.building = true;

			console.log("Building", modulePath, "module ...");

			mod_child_process.spawnSync("env", [
					"tsc",
				],
				{
					cwd: modulePath,
					stdio: [0, 1, 2],
				});
			mod_fs.renameSync(resolvePathIn(modulePath, config.runtimeJSSubPath),
				resolvePathIn(modulePath, config.runtimeMJSSubPath));

			config.building = false;
		}

		return (config);
	}

	buildModuleIn(currentPath);
}

module.exports.executeIn = executeIn;
