import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const targetVersion = process.env.npm_package_version ?? packageJson.version;

if (typeof targetVersion !== "string" || targetVersion.length === 0) {
	throw new Error(
		"Unable to determine target version from npm_package_version or package.json",
	);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;

if (typeof minAppVersion !== "string" || minAppVersion.length === 0) {
	throw new Error("manifest.json must define minAppVersion");
}

manifest.version = targetVersion;
writeFileSync("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", `${JSON.stringify(versions, null, 2)}\n`);
