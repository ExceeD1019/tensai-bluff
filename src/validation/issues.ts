/** お題の構造チェックが返す指摘。 */

export type Severity = "error" | "warn";

export interface Issue {
  code: string;
  severity: Severity;
  /** 対象データ（fact id / "structure" / "topic" など） */
  target: string;
  message: string;
  /** お題作成者への修正のヒント */
  fixHint: string;
}

export function issue(
  code: string,
  severity: Severity,
  target: string,
  message: string,
  fixHint: string,
): Issue {
  return { code, severity, target, message, fixHint };
}
