/**
 * Remotion Studio / render config. Next.js bundling is unaffected.
 * https://www.remotion.dev/docs/config
 */
import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
