
import { jest } from '@jest/globals';
import IChatToken from '../../src/external/IC3Adapter/IChatToken';
 interface AMSClient {
        initialize: (initConfig: { chatToken: { token: string } }) => Promise<void>;
    }
describe('tokenRefresher', () => {
    let tokenRefresher: () => Promise<string>;
    let tokenRefreshPromise: Promise<string> | null = null;
    let getChatTokenMock: jest.MockedFunction<(cached: boolean, optionParams: { refreshToken: boolean }) => Promise<IChatToken>>;

    type GetAMSClientFn = () => Promise<AMSClient>;
    let getAMSClientMock: jest.MockedFunction<GetAMSClientFn>;
    let chatToken: IChatToken | null = null;

    beforeEach(() => {
        jest.clearAllMocks();
        chatToken = null;
        tokenRefreshPromise = null;
        // Mock getChatToken to return a dummy token
        getChatTokenMock = jest.fn<() => Promise<IChatToken>>().mockResolvedValue({
            token: "mocked-token",
            expiresIn: new Date(Date.now() + 60 * 1000).toISOString(),
        });

        // Mock getAMSClient to return an object with an initialize function
        getAMSClientMock = jest.fn<GetAMSClientFn>().mockResolvedValue({
            initialize: jest.fn<AMSClient["initialize"]>().mockResolvedValue(undefined),
        });
        // Replace actual functions with mocks
        tokenRefresher = async (): Promise<string> => {
            if (chatToken && chatToken.token && chatToken.expiresIn && new Date(chatToken.expiresIn).getTime() > Date.now()) {
                return chatToken.token;
            }
            if (tokenRefreshPromise) {
                return tokenRefreshPromise;
            }

            tokenRefreshPromise = (async () => {
                try {
                    chatToken = await getChatTokenMock(false, { refreshToken: true });
                    const amsClient: AMSClient = await getAMSClientMock();
                    await amsClient.initialize({ chatToken: { token: "mocked-token" } });
                    return "mocked-token";
                } catch (error) {
                    console.error("Failed to refresh chat token:", error);
                    throw error;
                } finally {
                    tokenRefreshPromise = null;
                }
            })();

            return tokenRefreshPromise;
        };
    });

    it('should refresh token successfully', async () => {
        const token = await tokenRefresher();
        expect(token).toBe("mocked-token");
        expect(getChatTokenMock).toHaveBeenCalledTimes(1);
        expect(getAMSClientMock).toHaveBeenCalledTimes(1);
    });

    it('should return same promise for concurrent calls', async () => {
        const promise1 = tokenRefresher();
        const promise2 = tokenRefresher();

        await promise1;
        await promise2;
        expect(getChatTokenMock).toHaveBeenCalledTimes(1);
    });

    it('should return a new token after expiry', async () => {
        jest.useFakeTimers();

        const promise1 = tokenRefresher();
        await jest.advanceTimersByTimeAsync(61000);
        const promise2 = tokenRefresher();
        await promise1;
        await promise2;
        expect(getChatTokenMock).toHaveBeenCalledTimes(2);

        jest.useRealTimers();
    });

    it('should handle token refresh failures', async () => {
        getChatTokenMock.mockRejectedValue(new Error("Token fetch failed"));
        await expect(tokenRefresher()).rejects.toThrow("Token fetch failed");
        expect(tokenRefreshPromise).toBeNull();
    });

    it('should handle initialization failures', async () => {
        getAMSClientMock = jest.fn<() => Promise<AMSClient>>().mockResolvedValue({
            initialize: jest.fn(() => Promise.reject(new Error("Initialization failed"))),
        });

        await expect(tokenRefresher()).rejects.toThrow("Initialization failed");
        expect(tokenRefreshPromise).toBeNull();
    });
});
