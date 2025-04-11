const got = require('@/utils/got');
const cheerio = require('cheerio');
const { parseDate } = require('@/utils/parse-date');

module.exports = async (ctx) => {
    // 基础 URL
    const rootUrl = 'https://catcat.blog';
    
    // 获取页数参数，默认为1
    const page = ctx.query.page || 1;
    
    // 构建要抓取的 URL
    const currentUrl = page === 1 ? rootUrl : `${rootUrl}/page/${page}`;
    
    // 发送请求获取页面内容
    const response = await got({
        method: 'get',
        url: currentUrl,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        },
    });
    
    const $ = cheerio.load(response.data);
    
    // 根据网页结构，查找所有文章元素
    const list = $('article.post.card')
        .map((_, item) => {
            const element = $(item);
            const titleElement = element.find('a.post-title');
            const title = titleElement.text().trim();
            const link = titleElement.attr('href');
            
            // 解析时间
            const timeElement = element.find('.post-meta-detail-time time');
            let pubDate = '';
            if (timeElement.length > 0) {
                const timeText = timeElement.attr('title') || timeElement.text();
                // 从 "发布于 2025-4-02 9:58:50 | 编辑于 2025-4-02 9:59:00" 格式解析时间
                const matches = timeText.match(/发布于\s+(\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{1,2}:\d{1,2})/);
                if (matches && matches[1]) {
                    pubDate = parseDate(matches[1]);
                }
            }
            
            // 获取摘要内容
            const contentElement = element.find('.post-content');
            const excerpt = contentElement.text().trim();
            
            // 获取文章的分类
            const categories = [];
            element.find('.post-meta-detail-categories a').each((_, el) => {
                categories.push($(el).text().trim());
            });
            
            // 获取作者信息（如果有）
            const author = element.find('.post-meta-detail-author').text().trim() || 'catcat';
            
            return {
                title,
                link,
                pubDate,
                description: excerpt,
                author,
                category: categories,
            };
        })
        .get();
    
    // 获取每篇文章的完整内容
    const items = await Promise.all(
        list.map((item) =>
            ctx.cache.tryGet(item.link, async () => {
                try {
                    const detailResponse = await got({
                        method: 'get',
                        url: item.link,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                        },
                    });
                    
                    const content = cheerio.load(detailResponse.data);
                    
                    // 获取文章内容
                    const articleContent = content('article.post .post-content');
                    
                    // 处理文章中的图片链接，确保它们是绝对路径
                    articleContent.find('img').each((_, img) => {
                        const src = content(img).attr('src');
                        if (src && !src.startsWith('http')) {
                            content(img).attr('src', new URL(src, rootUrl).href);
                        }
                        
                        // 对于懒加载图片
                        const dataSrc = content(img).attr('data-original');
                        if (dataSrc) {
                            content(img).attr('src', dataSrc.startsWith('http') ? dataSrc : new URL(dataSrc, rootUrl).href);
                            // 移除懒加载相关属性
                            content(img).removeAttr('data-original');
                            content(img).removeAttr('class');
                        }
                    });
                    
                    // 使用文章的完整内容替换摘要
                    item.description = articleContent.html();
                    
                    // 查找更精确的分类信息（如果在详情页有更多）
                    if (content('.post-meta-detail-categories a').length > 0) {
                        const categories = content('.post-meta-detail-categories a')
                            .map((_, el) => content(el).text().trim())
                            .get();
                        item.category = categories;
                    }
                    
                    // 获取阅读量信息
                    const viewsMatch = content('.post-meta-detail-views').text().match(/(\d+)/);
                    if (viewsMatch && viewsMatch[1]) {
                        item.extra = {
                            views: parseInt(viewsMatch[1], 10),
                        };
                    }
                    
                    return item;
                } catch (err) {
                    // 如果获取文章详情失败，使用摘要作为内容
                    return item;
                }
            })
        )
    );
    
    // 获取博客名称和描述
    const title = $('meta[property="og:title"]').attr('content') || '猫猫博客';
    const description = $('meta[property="og:description"]').attr('content') || '猫猫博客 - 动画资源分享,Emby教程,VPS推荐与服务器测评';
    
    ctx.state.data = {
        title,
        description,
        link: rootUrl,
        item: items,
        language: $('html').attr('lang') || 'zh-Hans',
        // 添加 favicon
        image: $('link[rel="icon"]').attr('href') || `${rootUrl}/favicon.ico`,
        // 添加 RSS 生成时间
        updated: new Date().toISOString(),
        // 添加分页信息
        extra: {
            currentPage: parseInt(page, 10),
            hasNextPage: $('.pagination-mobile a.page-link:contains(»)').length > 0,
        },
    };
};
