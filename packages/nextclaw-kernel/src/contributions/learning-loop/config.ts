import type { Config } from "@nextclaw/core";

export const LEARNING_LOOP_DISABLED_METADATA_KEY = "learning_loop_disabled";
export const LEARNING_LOOP_LAST_TOOL_CALL_COUNT_METADATA_KEY =
  "learning_loop_last_tool_call_count";
export const LEARNING_LOOP_LAST_REQUESTED_AT_METADATA_KEY =
  "learning_loop_last_requested_at";
export const LEARNING_LOOP_LAST_REVIEW_SESSION_ID_METADATA_KEY =
  "learning_loop_last_review_session_id";
export const LEARNING_LOOP_SOURCE_SESSION_ID_METADATA_KEY =
  "learning_loop_source_session_id";
export const DEFAULT_LEARNING_LOOP_TOOL_CALL_THRESHOLD = 15;
export const DEFAULT_MEMORY_CAPTURE_INTERVAL = 3;
export const DEFAULT_MEMORY_DIGEST_WINDOW_DAYS = 3;

export type LearningLoopRuntimeConfig = {
  enabled: boolean;
  toolCallThreshold: number;
};

export type MemoryCaptureRuntimeConfig = {
  enabled: boolean;
  captureInterval: number;
  digestWindowDays: number;
};

export function readLearningLoopRuntimeConfig(
  config: Config,
): LearningLoopRuntimeConfig {
  return {
    enabled: config.agents.learningLoop.enabled,
    toolCallThreshold:
      config.agents.learningLoop.toolCallThreshold ??
      DEFAULT_LEARNING_LOOP_TOOL_CALL_THRESHOLD,
  };
}

export function readMemoryCaptureRuntimeConfig(
  config: Config,
): MemoryCaptureRuntimeConfig {
  const mem = config.agents.memoryCapture;
  return {
    enabled: mem?.enabled ?? false,
    captureInterval: mem?.captureInterval ?? DEFAULT_MEMORY_CAPTURE_INTERVAL,
    digestWindowDays: mem?.digestWindowDays ?? DEFAULT_MEMORY_DIGEST_WINDOW_DAYS,
  };
}
