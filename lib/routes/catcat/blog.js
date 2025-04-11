// lib/routes/catcat/blog.ts

// 导入必要的模块和类型
import { Route } from '@/types'; // 引入路由类型定义 [^3]
import cache from '@/utils/cache'; // 引入缓存工具 [^7]
import ofetch from '@/utils/ofetch'; // 引入统一的 HTTP 请求库 [^14, ^15]
import { load } from 'cheerio'; // 引入 HTML 解析库 [^15]
import { parseDate } from '@/utils/parse-date'; // 引入日期解析工具 [^12, ^27]
import logger from '@/utils/logger'; // 引入日志记录器 [^13]
// import { art } from '@/utils/render'; // 如果需要复杂模板渲染，取消注释
// import path from 'node:path'; // 如果使用 art 模板，取消注释
// import { getCurrentPath } from '@/utils/helpers'; // 如果使用 art 模板，取消注释

// const __dirname = getCurrentPath(import.meta.url); // 如果使用 art 模板，取消注释

// 定义目标网站的基础 URL
const baseUrl = 'https://catcat.blog';

// 定义路由对象
export const route: Route = {
    // 路由路径，将在命名空间后使用，例如 /catcat/blog [^3]
    path: '/blog',
    // 路由分类，用于文档分类，应为 category.ts 中定义的有效分类 [^3]
    categories: ['blog'],
    // 路由示例 URL，用于文档 [^3]
    example: '/catcat/blog',
    // 路由的可读名称，用于文档标题 [^3]
    name: '博客文章',
    // 路由维护者的 GitHub 用户名数组 [^3]
    maintainers: ['YourGitHubUsername'], // !! 请替换为您的 GitHub 用户名 !!
    // RSSHub Radar 规则，帮助浏览器扩展识别订阅源 [^5]
    radar: [
        {
            // 匹配的源网站 URL 模式 (不含协议)
            source: ['catcat.blog/'],
            // 生成的目标 RSSHub 路由路径
            target: '/blog',
        },
    ],
    // 路由特性说明，用于文档 [^3, ^5]
    features: {
        requireConfig: false, // 是否需要配置
        requirePuppeteer: false, // 是否需要 Puppeteer
        antiCrawler: false, // 是否有反爬机制
        supportBT: false, // 是否支持 BT 下载
        supportPodcast: false, // 是否支持播客
        supportScihub: false, // 是否支持 Sci-hub
    },
    // 路由的详细描述，会显示在文档中 [^3]
    description: '抓取 猫猫博客 (catcat.blog) 的最新文章。',

    // 路由核心处理函数 [^3, ^4]
    handler: async (ctx) => {
        // 构建列表页面的完整 URL
        const feedUrl = `${baseUrl}/`;
        logger.info(`[CatCat Blog] Fetching list page: ${feedUrl}`); // 添加日志记录

        let responseHtml;
        try {
            // 异步请求列表页面 HTML 内容 [^15]
            responseHtml = await ofetch(feedUrl);
        } catch (error: any) {
            // 捕获并记录请求错误
            logger.error(`[CatCat Blog] Failed to fetch list page ${feedUrl}: ${error.message}`);
            // 抛出错误，中断执行并告知上游服务 (如 Zeabur 网关) 内部错误
            throw new Error(`Failed to fetch list page: ${error.message}`);
        }

        // 使用 Cheerio 解析 HTML [^15]
        const $ = load(responseHtml);

        // 选择文章列表项的选择器 - !! 请务必根据实际网站 HTML 结构验证此选择器 !!
        const listSelector = 'main#main article.post.post-preview';
        const listItems = $(listSelector)
            .toArray()
            .map((item) => {
                const element = $(item);
                try {
                    const titleElement = element.find('header a.post-title');
                    // 确保链接是绝对路径
                    const link = new URL(titleElement.attr('href')!, baseUrl).href;
                    const timeElement = element.find('div.post-meta time');
                    // 假设日期格式为 'YYYY-MM-DD HH:MM' 或类似，parseDate 会尝试解析 [^27]
                    const dateText = timeElement.text().trim();

                    // 提取分类 (可选) [^18]
                    const category = element
                        .find('div.post-meta-detail-categories a')
                        .toArray()
                        .map((cat) => $(cat).text().trim());

                    // 返回包含基本信息的对象
                    return {
                        title: titleElement.text().trim(), // 文章标题 [^18]
                        link: link, // 文章链接 [^18]
                        pubDate: parseDate(dateText), // 发布日期 (Date 对象) [^18, ^27]
                        category: category, // 文章分类 (字符串数组) [^18]
                        // 可以先获取预览内容作为 description 的备选项
                        // description: element.find('.post-excerpt').html()?.trim() ?? '',
                    };
                } catch (e: any) {
                    // 记录解析单个列表项时的错误，并跳过此项
                    logger.error(`[CatCat Blog] Error parsing item on list page: ${e.message}`, element.html());
                    return null; // 返回 null 以便后续过滤
                }
            })
            .filter((item): item is NonNullable<typeof item> => item !== null); // 过滤掉解析失败的项 (null)

        // 如果没有找到任何列表项，发出警告
        if (listItems.length === 0) {
            logger.warn(`[CatCat Blog] No list items found on ${feedUrl} using selector '${listSelector}'. Website structure may have changed.`);
        }

        // 并发获取每篇文章的完整内容，并使用缓存 [^7, ^9]
        const items = await Promise.all(
            listItems.map((item) =>
                cache.tryGet(item.link, async () => {
                    // 默认先使用列表页可能获取的预览内容
                    let description = item.description || ''; // Assuming description might be pre-filled from list map
                    try {
                        logger.debug(`[CatCat Blog] Fetching detail page: ${item.link}`); // 使用 debug 级别日志记录详细请求
                        // 请求文章详情页
                        const detailResponse = await ofetch(item.link);
                        const detail$ = load(detailResponse);

                        // 选择文章正文内容的选择器 - !! 请务必根据实际文章页面 HTML 结构验证此选择器 !!
                        // 常见的选择器有 '.entry-content', '.article-content', '.post-body', 'article .post-content' 等
                        const contentSelector = 'article .entry-content'; // 尝试常见的 WordPress 内容选择器
                        const contentElement = detail$(contentSelector);

                        // 如果主要选择器未匹配，尝试备用选择器
                        if (!contentElement.length) {
                            const fallbackSelector = 'article div.post-content';
                            logger.debug(`[CatCat Blog] Primary content selector '${contentSelector}' failed for ${item.link}, trying fallback '${fallbackSelector}'`);
                            contentElement.push(...detail$(fallbackSelector).toArray()); // 使用 push 合并结果
                        }

                        // 如果最终没有找到内容元素，记录警告
                        if (!contentElement.length) {
                            logger.warn(`[CatCat Blog] Content selector failed to find content on detail page: ${item.link}`);
                            description = 'Content could not be loaded.'; // 提供明确的回退信息
                        } else {
                            // 获取正文 HTML 内容 [^18]
                            // 可以添加清理逻辑，移除不需要的部分，如广告、相关文章等
                            // contentElement.find('.ads, .related-posts').remove();
                            description = contentElement.html()?.trim() ?? '';
                            // 将换行符转换为 <br> 标签，以改善阅读器兼容性 [^17, ^20]
                            description = description.replace(/\n/g, '<br>');
                        }

                        // 更新 item 对象的 description 字段
                        item.description = description;

                        // (可选) 尝试在详情页获取作者信息 [^18]
                        // const authorSelector = '.author-name'; // !! 替换为实际作者选择器 !!
                        // const author = detail$(authorSelector).first().text().trim();
                        // if (author) {
                        //     item.author = author;
                        // }

                    } catch (error: any) {
                        // 捕获并记录获取或解析详情页时的错误
                        logger.error(`[CatCat Blog] Failed to fetch or parse detail page ${item.link}: ${error.message}`);
                        // 保留之前的预览内容或提供错误信息作为 description 回退
                        item.description = description || `Failed to load full content: ${error.message}`;
                    }
                    // 返回处理（或部分处理）后的 item 对象
                    return item;
                })
            )
        );

        // 返回最终的 Feed 对象结构 [^8, ^21]
        return {
            title: '猫猫博客', // Feed 的标题
            link: baseUrl, // Feed 的源网站链接
            description: '猫猫博客 - 动画资源分享, Emby教程, VPS推荐与服务器测评', // Feed 的描述 (可选)
            item: items, // Feed 的项目数组
            language: 'zh-cn', // Feed 的语言代码 (可选) [^8]
            allowEmpty: true, // 是否允许返回空 Feed (可选) [^18]
            // image: `${baseUrl}/path/to/logo.png`, // Feed 的图标 URL (可选) [^8]
            // author: '猫猫博客作者', // Feed 的作者 (可选) [^21]
        };
    },
};

