// lib/routes/catcat/index.js

module.exports = {
    // 域名 Key
    'catcat.blog': {
        // 网站名称
        _name: '猫猫博客',
        // 根路径 ('.') 对应的规则
        '.': [
            {
                // 规则标题 (对应 blog.ts 中的 route.name)
                title: '博客文章',
                // 文档链接 (可选，通常会自动生成)
                docs: 'https://docs.rsshub.app/routes/blog#catcat-blog',
                // 匹配的源 URL 路径 (相对于域名)
                source: ['/'],
                // 目标 RSSHub 路由路径 (完整路径)
                target: '/catcat/blog',
            },
            // 如果 catcat.blog 下有其他路由，可以在这里继续添加
        ],
    },
};
