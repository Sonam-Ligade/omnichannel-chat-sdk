/* eslint-disable @typescript-eslint/no-var-requires */
const OmnichannelChatSDK = require('../../src/OmnichannelChatSDK').default;

describe('tokenRefresher', () => {
    const omnichannelConfig = {
        orgUrl: '[data-org-url]',
        orgId: '[data-org-id]',
        widgetId: '[data-app-id]'
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('tokenRefresher should refresh token if expired at ACSClient.initialize', async () => {
        const expiredToken = 'expired-token';
        const refreshedToken = 'refreshed-token';

        const chatSDK = new OmnichannelChatSDK(omnichannelConfig, {
            useCreateConversation: { disable: true }
        });
        chatSDK.getChatConfig = jest.fn();
        chatSDK['isAMSClientAllowed'] = true;
        await chatSDK.initialize();

        jest.spyOn(chatSDK.OCClient, 'getChatToken')
            .mockResolvedValueOnce({
                ChatId: '',
                Token: expiredToken,
                ExpiresIn: new Date(Date.now() - 10000).toISOString(),
                RegionGtms: '{}',
                ACSEndpoint: ''
            })
            .mockResolvedValueOnce({
                ChatId: '',
                Token: refreshedToken,
                ExpiresIn: new Date(Date.now() + 60000).toISOString(),
                RegionGtms: '{}',
                ACSEndpoint: ''
            });

        jest.spyOn(chatSDK.OCClient, 'sessionInit').mockResolvedValue(Promise.resolve());
        jest.spyOn(chatSDK.AMSClient, 'initialize').mockResolvedValue(Promise.resolve());
        let acsInitConfig: any = undefined;
        jest.spyOn(chatSDK.ACSClient, 'initialize').mockImplementation(async (config) => {
            acsInitConfig = config;
        });
        jest.spyOn(chatSDK.ACSClient, 'joinConversation').mockResolvedValue(Promise.resolve());

        await chatSDK.startChat();

        //ACSClient.initialize with the expired token
        expect(chatSDK.ACSClient.initialize).toHaveBeenCalled();
        expect(acsInitConfig.token).toBe(expiredToken);
        expect(typeof acsInitConfig.tokenRefresher).toBe('function');

        // Call to tokenRefresher
        const newToken = await acsInitConfig.tokenRefresher();
        expect(newToken).toBe(refreshedToken);
        expect(expiredToken).not.toBe(newToken);

        // OCClient.getChatToken with refresh=true
        expect(chatSDK.OCClient.getChatToken).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ refreshToken: true }));
        expect(chatSDK.OCClient.getChatToken).toHaveBeenCalledTimes(2);
        expect(chatSDK.OCClient.sessionInit).toHaveBeenCalledTimes(1);
        expect(chatSDK.ACSClient.initialize).toHaveBeenCalledTimes(1);
        expect(chatSDK.ACSClient.joinConversation).toHaveBeenCalledTimes(1);
    });

    it('should not call tokenRefresher if token is still valid', async () => {
        const validToken = 'valid-token';

        const chatSDK = new OmnichannelChatSDK(omnichannelConfig, {
            useCreateConversation: { disable: true }
        });
        chatSDK.getChatConfig = jest.fn();
        chatSDK['isAMSClientAllowed'] = true;
        await chatSDK.initialize();

        // Only one mock for initial token, which is valid
        const getChatTokenSpy = jest.spyOn(chatSDK.OCClient, 'getChatToken')
            .mockResolvedValueOnce({
                ChatId: 'chatid',
                Token: validToken,
                ExpiresIn: new Date(Date.now() + 60000).toISOString(),
                RegionGtms: '{}',
                ACSEndpoint: 'endpoint'
            });

        jest.spyOn(chatSDK.OCClient, 'sessionInit').mockResolvedValue(Promise.resolve());
        jest.spyOn(chatSDK.AMSClient, 'initialize').mockResolvedValue(Promise.resolve());

        let acsInitConfig: any = undefined;
        jest.spyOn(chatSDK.ACSClient, 'initialize').mockImplementation(async (config) => {
            acsInitConfig = config;
        });
        jest.spyOn(chatSDK.ACSClient, 'joinConversation').mockResolvedValue(Promise.resolve());

        await chatSDK.startChat();

        const tokenRefresher = acsInitConfig.tokenRefresher;

        // Call the tokenRefresher while the token is still valid
        const token = await tokenRefresher();

        // Should return the cached token, no additional getChatToken call
        expect(token).toBe(validToken);
        expect(getChatTokenSpy).toHaveBeenCalledTimes(1);
    });

    it('tokenRefresher should return same promise for concurrent calls to tokenRefresher', async () => {
        const expiredToken = 'expired-token';
        const refreshedToken = 'refreshed-token';

        const chatSDK = new OmnichannelChatSDK(omnichannelConfig, {
            useCreateConversation: { disable: true }
        });
        chatSDK.getChatConfig = jest.fn();
        chatSDK['isAMSClientAllowed'] = true;
        await chatSDK.initialize();
        jest.spyOn(chatSDK.OCClient, 'getChatToken')
            .mockResolvedValueOnce({
                ChatId: '',
                Token: expiredToken,
                ExpiresIn: new Date(Date.now() - 10000).toISOString(),
                RegionGtms: '{}',
                ACSEndpoint: ''
            })
            .mockResolvedValueOnce({
                ChatId: '',
                Token: refreshedToken,
                ExpiresIn: new Date(Date.now() + 60000).toISOString(),
                RegionGtms: '{}',
                ACSEndpoint: ''
            });

        jest.spyOn(chatSDK.OCClient, 'sessionInit').mockResolvedValue(Promise.resolve());
        jest.spyOn(chatSDK.AMSClient, 'initialize').mockResolvedValue(Promise.resolve());

        let acsInitConfig: any = undefined;
        jest.spyOn(chatSDK.ACSClient, 'initialize').mockImplementation(async (config) => {
            acsInitConfig = config;
        });
        jest.spyOn(chatSDK.ACSClient, 'joinConversation').mockResolvedValue(Promise.resolve());

        await chatSDK.startChat();

        const tokenRefresher = acsInitConfig.tokenRefresher;

        // Call tokenRefresher concurrently
        const promise1 = tokenRefresher();
        const promise2 = tokenRefresher();

        const [token1, token2] = await Promise.all([promise1, promise2]);
        expect(token1).toBe(token2);
        expect(token1).toBe(refreshedToken);
        expect(chatSDK.OCClient.getChatToken).toHaveBeenCalledTimes(2); // One for expired, one for refresh
    });

    it('tokenRefresher should return a new token after expiry', async () => {
        const expiredToken = 'expired-token';
        const refreshedToken1 = 'refreshed-token-1';
        const refreshedToken2 = 'refreshed-token-2';

        const chatSDK = new OmnichannelChatSDK(omnichannelConfig, {
            useCreateConversation: { disable: true }
        });
        chatSDK.getChatConfig = jest.fn();
        chatSDK['isAMSClientAllowed'] = true;
        await chatSDK.initialize();

        jest.spyOn(chatSDK.OCClient, 'getChatToken')
            .mockResolvedValueOnce({
                ChatId: '',
                Token: expiredToken,
                ExpiresIn: new Date(Date.now() - 10000).toISOString(),
                RegionGtms: '{}',
                ACSEndpoint: ''
            })
            .mockResolvedValueOnce({
                ChatId: '',
                Token: refreshedToken1,
                ExpiresIn: new Date(Date.now() + 1000).toISOString(), // almost expired
                RegionGtms: '{}',
                ACSEndpoint: ''
            })
            .mockResolvedValueOnce({
                ChatId: '',
                Token: refreshedToken2,
                ExpiresIn: new Date(Date.now() + 60000).toISOString(),
                RegionGtms: '{}',
                ACSEndpoint: ''
            });

        jest.spyOn(chatSDK.OCClient, 'sessionInit').mockResolvedValue(Promise.resolve());
        jest.spyOn(chatSDK.AMSClient, 'initialize').mockResolvedValue(Promise.resolve());

        let acsInitConfig: any = undefined;
        jest.spyOn(chatSDK.ACSClient, 'initialize').mockImplementation(async (config) => {
            acsInitConfig = config;
        });
        jest.spyOn(chatSDK.ACSClient, 'joinConversation').mockResolvedValue(Promise.resolve());

        await chatSDK.startChat();

        const tokenRefresher = acsInitConfig.tokenRefresher;

        // First refresh, should return refreshedToken1
        const token1 = await tokenRefresher();
        expect(token1).toBe(refreshedToken1);

        // adjust token expiry
        chatSDK['chatToken'].expiresIn = new Date(Date.now() - 10000).toISOString();

        // Next call, should trigger another refresh and get refreshedToken2
        const token2 = await tokenRefresher();
        expect(token2).toBe(refreshedToken2);

        expect(chatSDK.OCClient.getChatToken).toHaveBeenCalledTimes(3);
    });

    it('tokenRefresher should handle token refresh failures', async () => {
        const expiredToken = 'expired-token';

        const chatSDK = new OmnichannelChatSDK(omnichannelConfig, {
            useCreateConversation: { disable: true }
        });
        chatSDK.getChatConfig = jest.fn();
        chatSDK['isAMSClientAllowed'] = true;
        await chatSDK.initialize();

        jest.spyOn(chatSDK.OCClient, 'getChatToken')
            .mockResolvedValueOnce({
                ChatId: '',
                Token: expiredToken,
                ExpiresIn: new Date(Date.now() - 10000).toISOString(),
                RegionGtms: '{}',
                ACSEndpoint: ''
            })
            .mockRejectedValueOnce(new Error('Token fetch failed'));

        jest.spyOn(chatSDK.OCClient, 'sessionInit').mockResolvedValue(Promise.resolve());
        jest.spyOn(chatSDK.AMSClient, 'initialize').mockResolvedValue(Promise.resolve());

        let acsInitConfig: any = undefined;
        jest.spyOn(chatSDK.ACSClient, 'initialize').mockImplementation(async (config) => {
            acsInitConfig = config;
        });
        jest.spyOn(chatSDK.ACSClient, 'joinConversation').mockResolvedValue(Promise.resolve());

        await chatSDK.startChat();

        const tokenRefresher = acsInitConfig.tokenRefresher;

        // tokenRefresher to throw an error
        await expect(tokenRefresher()).rejects.toMatchObject({
            message: 'ChatTokenRetrievalFailure',
            exceptionDetails: expect.objectContaining({
                errorObject: expect.stringContaining('Token fetch failed')
            })
        });
    });
});
