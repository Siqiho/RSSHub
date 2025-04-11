// lib/routes/catcat/index.js

// 使用 CommonJS 模块导出，这是 RSSHub 路由索引文件的标准格式
module.exports = {
    // 顶级 Key 是该命名空间主要对应的域名 (不含协议) [^29]
    'catcat.blog': {
        // 网站的可读名称，会显示在文档和部分 UI 中
        _name: '猫猫博客',

        // Key '.' 代表网站的根路径或默认路径下的规则
        // 如果有针对特定子路径的规则，可以用子路径作为 Key，例如 '/category/news'
        '.': [
            // 每个对象代表一个具体的 RSS Feed 规则
            {
                // Feed 的标题，应与对应路由文件 (blog.ts) 中的 'name' 保持一致 [^9]
                title: '博客文章',

                // 指向该路由文档页面的链接 (可选，但推荐)
                // 格式通常是 https://docs.rsshub.app/routes/<category>#<anchor>
                // <category> 来自 blog.ts 中的 categories
                // <anchor> 通常是域名相关的标识符
                docs: 'https://docs.rsshub.app/routes/blog#catcat-blog',

                // 匹配的源网站 URL 路径 (相对于域名 'catcat.blog')
                // 这个数组定义了当用户在源网站的哪些路径下时，RSSHub Radar 等工具会提示此 Feed
                // '/' 表示匹配网站根目录，即 https://catcat.blog/ [^27]
                source: ['/'],

                // 目标 RSSHub 路由路径 (完整路径，包含命名空间)
                // 指向您在 blog.ts 中定义的 'path'，前面加上命名空间 'catcat' [^4]
                target: '/catcat/blog',
            },
            // --- 如果 'catcat.blog' 下还有其他路由 ---
            // 例如，如果有一个专门抓取 '分类A' 的路由 lib/routes/catcat/categoryA.ts
            // 假设其 path: '/category/a', name: '分类A文章'
            // 可以在这里添加：
            /*
            {
                title: '分类A文章',
                docs: 'https://docs.rsshub.app/routes/blog#catcat-blog-category-a', // 需要一个合适的锚点
                source: ['/category/a'], // 匹配源站的 /category/a 路径
                target: '/catcat/category/a', // 指向 /catcat/category/a 路由
            },
            */
            // --- 结束示例 ---
        ],
        // --- 如果有专门针对子路径的规则组 ---
        // 例如，如果所有 /archives/ 下的规则都不同
        /*
        '/archives': [
            {
                title: '存档文章',
                docs: '...',
                source: ['/archives/:year/:month'], // 假设源路径包含年月参数
                target: '/catcat/archives/:year/:month', // 目标路由也接收参数
            }
        ],
        */
        // --- 结束示例 ---
    },
};

// 文件末尾保留一个空行，符合代码规范 [^11]

