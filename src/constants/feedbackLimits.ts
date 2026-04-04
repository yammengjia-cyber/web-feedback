/** 天上飘的云 / GET 接口只返回这么多条（最新优先） */
export const FEEDBACK_DISPLAY_LIMIT = 20;

/**
 * feedback.json 里最多保留多少条（含评论与可选图片），防止单文件无限膨胀。
 * 可通过环境变量 FEEDBACK_MAX_STORED 覆盖。
 */
export const FEEDBACK_MAX_STORED_DEFAULT = 2000;
