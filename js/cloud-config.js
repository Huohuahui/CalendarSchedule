/**
 * ============================================================
 * cloud-config.js - 云服务公开配置
 * ------------------------------------------------------------
 * 由「开通云服务」时生成的 publicConfig，只有两个值可以出现在前端：
 *   endpoint       —— 本应用的数据面地址。必须原样交给 SDK 初始化，
 *                     严禁硬编码到别处、也不许从 location / 环境变量推断。
 *   publishableKey —— 标识「哪个应用」，本身不带任何权限；
 *                     服务端会强制校验请求来源域名（Origin）。
 *
 * ⚠️ 这里绝不允许放长期密钥或管理凭据。
 * ⚠️ 云备份功能仅在本应用的正式发布域名下可用（服务端 Origin 校验）。
 * ============================================================
 */

window.CLOUD_CONFIG = {
    endpoint: 'https://schedule-calendar-67950.app.workbuddy.host',
    publishableKey: 'wbpk_hSFhRGJ6gZ96FBenrpe0iu_yvNOFh262q38S6nByb3y2vjbiQ50AuVh'
};
