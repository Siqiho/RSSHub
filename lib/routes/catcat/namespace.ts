// lib/routes/catcat/namespace.ts

import type { Namespace } from '@/types';

export const namespace: Namespace = {
    // 供人阅读的命名空间名称，会用作文档标题
    name: '猫猫博客',
    // 对应网站的网址 (不含协议)
    url: 'catcat.blog',
    // 可选：对使用此命名空间用户的提示和额外说明，会被插入到文档中
    description: `猫猫博客 (catcat.blog) - 动画资源分享, Emby教程, VPS推荐与服务器测评`,
    // 可选：多语言支持，用于生成多语言文档
    // zh: {
    //     name: '猫猫博客',
    //     description: `猫猫博客 (catcat.blog) - 动画资源分享, Emby教程, VPS推荐与服务器测评`,
    // },
};

