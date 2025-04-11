// lib/routes/catcat/namespace.ts

// 导入 Namespace 类型定义，用于类型检查
import type { Namespace } from '@/types'; // [^14]

// 定义并导出命名空间对象
export const namespace: Namespace = {
    // 命名空间的易读名称，将作为文档中该部分的标题 [^14]
    // 应与 index.js 中的 _name 和 blog.ts 返回的 feed title 核心部分保持一致或相关
    name: '猫猫博客',

    // 对应网站的 URL (不包含协议，例如 'github.com') [^14]
    // 这个 URL 应该与 index.js 中的顶级 key ('catcat.blog') 匹配
    url: 'catcat.blog',

    // 可选：对该命名空间（通常是网站）的描述 [^14]
    // 这个描述会出现在文档页面的顶部，可以包含 Markdown 格式
    // 内容应与网站主题相关
    description: `猫猫博客 (catcat.blog) 是一个分享动画资源、Emby 教程、VPS 推荐与服务器测评的网站。`,

    // 可选：提供中文语言下的特定信息，用于生成多语言文档 [^14]
    // 在这里，由于主名称和描述已经是中文，它可能看起来重复，
    // 但有助于保持结构完整性，方便未来添加其他语言。
    zh: {
        name: '猫猫博客', // 中文名称 (与主 name 相同)
        description: `猫猫博客 (catcat.blog) 是一个分享动画资源、Emby 教程、VPS 推荐与服务器测评的网站。`, // 中文描述 (与主 description 相同)
    },
    // 可以根据需要添加其他语言，例如：
    // ja: {
    //     name: '猫猫ブログ',
    //     description: '猫猫ブログ (catcat.blog) は、アニメーションリソース共有、Embyチュートリアル、VPS推奨、サーバー評価を共有するウェブサイトです。'
    // },
};

// 文件末尾保留一个空行，符合代码规范 [^18]

