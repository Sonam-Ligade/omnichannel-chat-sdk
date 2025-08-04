import { AbortSignalLike } from "@azure/abort-controller";

export default interface ACSClientConfig {
    token: string;
    environmentUrl: string;
    tokenRefresher?: (abortSignal? : AbortSignalLike) => Promise<string>;
}