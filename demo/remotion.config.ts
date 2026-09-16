import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// Concurrency 1 keeps memory predictable on a laptop; raise it if you have cores to spare.
Config.setConcurrency(1);
