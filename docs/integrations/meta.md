# Meta Integrations Guide (WhatsApp & Instagram)

## WhatsApp Cloud API
1. Register on Meta for Developers: https://developers.facebook.com
2. Create a Business App.
3. Add the **WhatsApp** product.
4. Obtain `WHATSAPP_PHONE_NUMBER_ID` and a permanent System User Token (`WHATSAPP_ACCESS_TOKEN`).
5. Set Webhook URL to: `https://your-domain.com/api/telegram/webhook` or your ngrok tunnel with `WHATSAPP_VERIFY_TOKEN`.

## Instagram Creator Messaging
1. Link your Instagram Creator account to a Facebook Page.
2. Under Meta App > Messenger / Instagram Graph API, generate `META_PAGE_ACCESS_TOKEN`.
3. Add `INSTAGRAM_ACCOUNT_ID`.
4. Note: Per Meta platform policy, only messages and mentions sent directly to the creator account are accessible.
