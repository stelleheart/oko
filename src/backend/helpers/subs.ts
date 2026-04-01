import { list } from "subsrt-ts";

import { proxiedFetch } from "@/backend/helpers/fetch";
import { convertSubtitlesToSrt } from "@/components/player/utils/captions";
import { CaptionListItem } from "@/stores/player/slices/source";
import { SimpleCache } from "@/utils/cache";
import { isUrlAlreadyProxied } from "@/components/player/utils/proxy";

import {
  isExtensionActiveCached,
  sendExtensionRequest,
} from "../extension/messaging";

export const subtitleTypeList = list().map((type) => `.${type}`);
const downloadCache = new SimpleCache<string, string>();
downloadCache.setCompare((a, b) => a === b);
const expirySeconds = 24 * 60 * 60;

/**
 * Always returns SRT
 */
export async function downloadCaption(
  caption: CaptionListItem,
): Promise<string> {
  const cached = downloadCache.get(caption.url);
  if (cached) return cached;

  let data: string;
  if (caption.needsProxy) {
    if (isExtensionActiveCached()) {
      try {
        const extensionResponse = await sendExtensionRequest({
          url: caption.url,
          method: "GET",
        });
        if (
          !extensionResponse?.success ||
          typeof extensionResponse.response.body !== "string"
        ) {
          throw new Error("extension failed to get caption");
        }
        data = extensionResponse.response.body;
      } catch {
        // Fallback to proxy if extension fails (e.g., not whitelisted)
        data = await proxiedFetch<string>(caption.url, {
          responseType: "text",
          headers: {
            "Accept-Charset": "utf-8",
          },
        });
      }
    } else {
      data = await proxiedFetch<string>(caption.url, {
        responseType: "text",
        headers: {
          "Accept-Charset": "utf-8",
        },
      });
    }
  } else {
    const response = await fetch(caption.url);
    const contentType = response.headers.get("content-type") || "";
    const charset = contentType.includes("charset=")
      ? contentType.split("charset=")[1].toLowerCase()
      : "utf-8";

    // Get the raw bytes
    const buffer = await response.arrayBuffer();
    // Decode using the detected charset, defaulting to UTF-8
    const decoder = new TextDecoder(charset);
    data = decoder.decode(buffer);
  }
  if (!data) throw new Error("failed to get caption data");

  const output = convertSubtitlesToSrt(data);
  downloadCache.set(caption.url, output, expirySeconds);
  return output;
}

/**
 * Downloads the WebVTT content. Uses extension or CORS proxy fallback
 * when the extension is not active.
 */
export async function downloadWebVTT(url: string): Promise<string> {
  const cached = downloadCache.get(url);
  if (cached) return cached;

  let data: string;
  if (isExtensionActiveCached()) {
    const extensionResponse = await sendExtensionRequest({
      url,
      method: "GET",
    });
    if (!extensionResponse?.success || typeof extensionResponse.response.body !== "string") {
      throw new Error("failed to get webvtt data from extension");
    }
    data = extensionResponse.response.body;
  } else {
    // If the URL is already proxied, fetch directly; otherwise use the CORS proxy
    if (isUrlAlreadyProxied(url)) {
      data = await fetch(url).then((v) => v.text());
    } else {
      data = await proxiedFetch<string>(url, {
        responseType: "text",
        headers: {
          "Accept-Charset": "utf-8",
        },
      });
    }
  }

  return data;
}
