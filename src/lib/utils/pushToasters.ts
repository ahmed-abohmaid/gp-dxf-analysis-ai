import { sileo } from "sileo";

export function pushErrorToast(message: string): void {
  sileo.error({ title: message });
}

export function pushSuccessToast(message: string): void {
  sileo.success({ title: message });
}

// @future: used when info/warning notifications are needed (e.g. RAG index status)
export function pushInfoToast(message: string): void {
  sileo.info({ title: message });
}

export function pushWarningToast(message: string): void {
  sileo.warning({ title: message });
}
