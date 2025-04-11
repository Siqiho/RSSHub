// lib/routes/catcat/blog.ts

// 导入必要的模块和类型
import { Route } from '@/types'; // 引入路由类型定义 [^7]
import cache from '@/utils/cache'; // 引入缓存工具 [^5]
import ofetch from '@/utils/ofetch'; // 引入统一的 HTTP 请求库 [^3, ^14]
import { load } from 'cheerio'; // 引入 HTML 解析库
import { parseDate } from '@/utils/parse-date'; // 引入日期解析工具 [^1, ^23]
import logger from '@/utils/logger'; // 引入日志记录器 [^16]
// import { art } from '@/utils/render'; // 如果需要复杂模板渲染，取消注释
// import path from 'node:path'; // 如果使用 art 模板，取消注释
// import { getCurrentPath } from '@/utils/helpers'; // 如果使用 art 模板，取消注释

// const __dirname = getCurrentPath(import.meta.url); // 如果使用 art 模板，取消注释

// 定义目标网站的基础 URL
const baseUrl = 'https://catcat.blog';

// 定义一个常见的浏览器 User-Agent
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'; // 你可以选择一个更新的 UA

// 定义路由对象
export const route: Route = {
    // 路由路径 [^7]
    path: '/blog',
    // 路由分类 [^7]
    categories: ['blog'],
    // 路由示例 [^7]
    example: '/catcat/blog',
    // 路由名称 [^7]
    name: '博客文章',
    // 维护者 [^7]
    maintainers: ['YourGitHubUsername'], // !! 请替换为您的 GitHub 用户名 !!
    // RSSHub Radar 规则 [^7, ^9, ^21]
    radar: [
        {
            source: ['catcat.blog/'],
            target: '/blog',
        },
    ],
    // 路由特性 [^7]
    features: {
        requireConfig: false,
        requirePuppeteer: false, // 暂时标记为 false，如果 User-Agent 不行再考虑改为 true
        antiCrawler: true, // 标记存在反爬，因为遇到了 403
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    // 路由描述 [^7]
    description: '抓取 猫猫博客 (catcat.blog) 的最新文章。',

    // 路由核心处理函数 [^7, ^9]
    handler: async (ctx) => {
        const feedUrl = `${baseUrl}/`;
        logger.info(`[CatCat Blog] Fetching list page: ${feedUrl}`);

        let responseHtml;
        try {
            // 使用 ofetch 请求列表页面，并添加 User-Agent 请求头
            responseHtml = await ofetch(feedUrl, {
                headers: {
                    'User-Agent': BROWSER_UA, // 添加 User-Agent
                },
            });
        } catch (error: any) {
            // 检查错误是否包含响应状态码
            const status = error?.response?.status;
            if (status === 403) {
                logger.error(`[CatCat Blog] Access denied (403 Forbidden) when fetching list page ${feedUrl}. Anti-crawler measure in place?`);
                 // 可以考虑抛出一个更具体的错误或提示用户可能需要 Puppeteer
                 throw new Error(`Access denied (403 Forbidden) by ${feedUrl}. The site may require browser emulation (Puppeteer).`);
            } else {
                 logger.error(`[CatCat Blog] Failed to fetch list page ${feedUrl}: ${error.message}`);
                 throw new Error(`Failed to fetch list page: ${error.message}`);
            }
        }

        // 使用 Cheerio 解析 HTML
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
                    // 假设日期格式为 'YYYY-MM-DD HH:MM' 或类似，parseDate 会尝试解析 [^23]
                    const dateText = timeElement.text().trim();

                    // 提取分类 (可选) [^20, ^29]
                    const category = element
                        .find('div.post-meta-detail-categories a')
                        .toArray()
                        .map((cat) => $(cat).text().trim());

                    // 返回包含基本信息的对象
                    return {
                        title: titleElement.text().trim(), // 文章标题 [^20, ^29]
                        link: link, // 文章链接 [^20, ^29]
                        pubDate: parseDate(dateText), // 发布日期 (Date 对象) [^20, ^29]
                        category: category, // 文章分类 (字符串数组) [^20, ^29]
                        // description: element.find('.post-excerpt').html()?.trim() ?? '', // 可选：先获取预览描述
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
            logger.warn(`[CatCat Blog] No list items found on ${feedUrl} using selector '${listSelector}'. Website structure may have changed or access was blocked.`);
        }

        // 并发获取每篇文章的完整内容，并使用缓存 [^5, ^15]
        const items = await Promise.all(
            listItems.map((item) =>
                cache.tryGet(item.link, async () => { // [^5]
                    let description = item.description || ''; // 使用列表页可能获取的预览内容作为初始值
                    try {
                        logger.debug(`[CatCat Blog] Fetching detail page: ${item.link}`); // 使用 debug 级别日志记录详细请求
                        // 请求文章详情页时同样添加 User-Agent
                        const detailResponse = await ofetch(item.link, {
                            headers: {
                                'User-Agent': BROWSER_UA,
                            },
                        });
                        const detail$ = load(detailResponse);

                        // 选择文章正文内容的选择器 - !! 请务必根据实际文章页面 HTML 结构验证此选择器 !!
                        const contentSelector = 'article .entry-content'; // 尝试常见的 WordPress 内容选择器
                        let contentElement = detail$(contentSelector);

                        // 如果主要选择器未匹配，尝试备用选择器
                        if (!contentElement.length) {
                            const fallbackSelector = 'article div.post-content';
                            logger.debug(`[CatCat Blog] Primary content selector '${contentSelector}' failed for ${item.link}, trying fallback '${fallbackSelector}'`);
                            contentElement = detail$(fallbackSelector); // 重新赋值
                        }

                        // 如果最终没有找到内容元素，记录警告
                        if (!contentElement.length) {
                            logger.warn(`[CatCat Blog] Content selector failed to find content on detail page: ${item.link}`);
                            description = 'Content could not be loaded.'; // 提供明确的回退信息
                        } else {
                            // 获取正文 HTML 内容 [^20, ^29]
                            // 可以添加清理逻辑，移除不需要的部分
                            // contentElement.find('.ads, .related-posts').remove();
                            description = contentElement.html()?.trim() ?? '';
                            // 将换行符转换为 <br> 标签 [^6, ^19]
                            description = description.replace(/\n/g, '<br>');
                        }

                        // 更新 item 对象的 description 字段
                        item.description = description;

                        // (可选) 尝试在详情页获取作者信息 [^20, ^29]
                        // const authorSelector = '.author-name'; // !! 替换为实际作者选择器 !!
                        // const author = detail$(authorSelector).first().text().trim();
                        // if (author) {
                        //     item.author = author;
                        // }

                    } catch (error: any) {
                         // 特别处理详情页的 403 错误
                         const status = error?.response?.status;
                         if (status === 403) {
                             logger.error(`[CatCat Blog] Access denied (403 Forbidden) when fetching detail page ${item.link}`);
                             // 保留预览内容或提供特定错误信息
                             item.description = description || `Failed to load full content: Access denied (403 Forbidden).`;
                         } else {
                            // 处理其他获取/解析详情页的错误
                            logger.error(`[CatCat Blog] Failed to fetch or parse detail page ${item.link}: ${error.message}`);
                            // 保留预览内容或提供通用错误信息
                            item.description = description || `Failed to load full content: ${error.message}`;
                         }
                    }
                    // 返回处理（或部分处理）后的 item 对象
                    return item;
                })
            )
        );

        // 返回最终的 Feed 对象结构 [^10, ^25, ^29]
        return {
            title: '猫猫博客', // Feed 的标题 [^10, ^25]
            link: baseUrl, // Feed 的源网站链接 [^10, ^25]
            description: '猫猫博客 - 动画资源分享, Emby教程, VPS推荐与服务器测评', // Feed 的描述 (可选) [^10, ^25]
            item: items, // Feed 的项目数组
            language: 'zh-cn', // Feed 的语言代码 (可选) [^10, ^25]
            allowEmpty: true, // 是否允许空 Feed (可选) [^20, ^29]
            // image: `${baseUrl}/path/to/logo.png`, // Feed 的图标 URL (可选) [^10, ^25]
            // author: '猫猫博客作者', // Feed 的作者 (可选) [^10, ^25]
        };
    },
};

// 文件末尾保留一个空行，符合代码规范 [^27]
