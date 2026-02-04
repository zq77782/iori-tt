import { isAdminAuthenticated, errorResponse, jsonResponse } from '../_middleware';

export async function onRequest(context) {
  const { request, env } = context;

  // GET：公开读取快捷键配置（无需登录）
  if (request.method === 'GET') {
    try {
      // 优先从 KV 读取（更快、更适合公开配置）
      let shortcut = await env.kj.get('sidebar_shortcut');

      // 如果 KV 中没有，回退到 D1（兼容旧数据）
      if (!shortcut) {
        const result = await env.NAV_DB.prepare(
          "SELECT value FROM settings WHERE key = 'sidebar_shortcut'"
        ).first();
        shortcut = result?.value || 'Q'; // 默认 Q
      }

      return jsonResponse({
        code: 200,
        data: { sidebar_shortcut: shortcut }
      });
    } catch (e) {
      console.error('读取快捷键失败：', e);
      return jsonResponse({
        code: 200,
        data: { sidebar_shortcut: 'Q' } // 出错时返回默认值
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
  
      // 修改校验：允许单个字符或短字符串（例如 "C" 或 "Ctrl+K"）
      if (!newShortcut || newShortcut.length < 1 || newShortcut.length > 10) {
        return errorResponse('快捷键值无效（1-10个字符）', 400);
      }
  
      // 写入 KV
      await env.kj.put('sidebar_shortcut', newShortcut);
  
      // 可选备份到 D1
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
