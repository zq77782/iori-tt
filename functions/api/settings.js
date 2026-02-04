import { isAdminAuthenticated, errorResponse, jsonResponse } from '../_middleware';

export async function onRequest(context) {
  const { request, env } = context;

  // GET：公开读取快捷键配置（无需登录）
  if (request.method === 'GET') {
    try {
      // 优先从 KV 读取
      let shortcut = await env.kj.get('sidebar_shortcut');

      // 如果 KV 中没有，回退到 D1 查询
      if (!shortcut) {
        const result = await env.NAV_DB.prepare(
          "SELECT value FROM settings WHERE key = 'sidebar_shortcut'"
        ).first();
        shortcut = result?.value || 'Q';
      }

      return jsonResponse({
        code: 200,
        data: { sidebar_shortcut: shortcut }
      });
    } catch (e) {
      console.error('读取快捷键失败：', e);
      return jsonResponse({
        code: 200,
        data: { sidebar_shortcut: 'Q' }
      });
    }
  }

  // POST：保存快捷键（需要管理员登录）
  if (request.method === 'POST') {
    if (!(await isAdminAuthenticated(request, env))) {
      return errorResponse('Unauthorized', 401);
    }

    try {
      const body = await request.json();
      const newShortcut = body.sidebar_shortcut?.trim();

      // 放宽校验：至少 1 个字符，最多 10 个字符（支持单个键或短组合）
      if (!newShortcut || newShortcut.length < 1 || newShortcut.length > 10) {
        return errorResponse('快捷键值无效（1-10个字符）', 400);
      }

      // 写入 KV（主存储）
      await env.kj.put('sidebar_shortcut', newShortcut);

      // 备份到 D1（可选，如果您想保留 D1 数据）
      await env.NAV_DB.prepare(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
      )
        .bind('sidebar_shortcut', newShortcut)
        .run();

      return jsonResponse({
        code: 200,
        message: '快捷键已保存',
        data: { sidebar_shortcut: newShortcut }
      });
    } catch (e) {
      console.error('保存快捷键失败：', e);
      return errorResponse(`保存失败：${e.message}`, 500);
    }
  }

  return errorResponse('Method Not Allowed', 405);
}
