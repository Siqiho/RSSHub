// lib/routes/catcat/blog.ts

import { Route } from '@/types';
import { getCurrentPath } from '@/utils/helpers';
import cache from '@/utils/cache'; // Import cache utility
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import { art } from '@/utils/render'; // Import art template renderer if needed for complex descriptions
import path from 'node:path'; // Import path if using art template

const __dirname = getCurrentPath(import.meta.url);

// Define Base URL
const baseUrl = 'https://catcat.blog';

export const route: Route = {
    // Route path
    path: '/blog',
    // Optional parameters
    // parameters: { id: 'user id' },
    // Categories
    categories: ['blog'], // Should be one of the categories listed in category.ts
    // Route name
    name: '博客文章',
    // Maintainers
    maintainers: ['YourGitHubUsername'], // !! Replace with your GitHub username !!
    // Optional features
    features: {
        requireConfig: false, // Does it require configuration?
        requirePuppeteer: false, // Does it require Puppeteer?
        antiCrawler: false, // Is there anti-crawler mechanism?
        supportBT: false, // Does it support BT download?
        supportPodcast: false, // Does it support podcast?
        supportScihub: false, // Does it support Sci-hub?
    },
    // Radar rule
    radar: [
        {
            source: ['catcat.blog/'],
            target: '/blog',
        },
    ],
    // Example usage
    example: '/catcat/blog',
    // Description
    description: `抓取 猫猫博客 (catcat.blog) 的最新文章。`,

    // Main logic
    handler: async (ctx) => {
        const feedUrl = `${baseUrl}/`;

        // Fetch the main blog page (list page)
        const response = await ofetch(feedUrl);
        const $ = load(response);

        // Select article list items
        const listItems = $('main#main article.post.post-preview')
            .toArray()
            .map((item) => {
                const element = $(item);
                const titleElement = element.find('header a.post-title');
                const link = new URL(titleElement.attr('href')!, baseUrl).href; // Ensure absolute URL
                const timeElement = element.find('div.post-meta time');
                // Extract date string from text, assuming format like 'YYYY-MM-DD HH:MM'
                const dateText = timeElement.text().trim();

                return {
                    title: titleElement.text().trim(),
                    link: link,
                    // Use parseDate for robust date parsing
                    pubDate: parseDate(dateText),
                    // Category extraction (optional)
                    category: element
                        .find('div.post-meta-detail-categories a')
                        .toArray()
                        .map((cat) => $(cat).text().trim()),
                };
            });

        // Fetch full content for each article using cache
        const items = await Promise.all(
            listItems.map((item) =>
                cache.tryGet(item.link, async () => {
                    let description = '';
                    try {
                        // Fetch the individual article page
                        const detailResponse = await ofetch(item.link);
                        const detail$ = load(detailResponse);

                        // Selector for the main article content
                        // !! Inspect an actual article page HTML to confirm this selector !!
                        // Common selectors are '.entry-content', '.article-content', '.post-body', etc.
                        // Based on the list page structure, '.post-content' might be reused, but verify.
                        // Let's assume the full content might be within a different structure on the detail page.
                        // A common WordPress structure is <div class="entry-content"> or similar within the <article> tag.
                        // Let's try a more specific selector for the detail page:
                        const contentElement = detail$('article .entry-content') // Try this common selector first
                                                .length ? detail$('article .entry-content') : detail$('article div.post-content'); // Fallback to the list page selector if needed

                        // Optional: Remove unwanted elements like related posts, ads, share buttons within the content
                        // contentElement.find('.related-posts, .share-buttons, .comments-area').remove();

                        description = contentElement.html() ?? ''; // Get the full HTML content

                        // Optional: If using art template for complex rendering
                        // description = art(path.join(__dirname, 'templates/description.art'), {
                        //     // pass data to template
                        // });

                    } catch (error) {
                        // Log error or handle gracefully (e.g., keep preview description)
                        // logger.error(`Failed to fetch full content for ${item.link}: ${error}`);
                        // Fallback to empty description or potentially a preview scraped earlier if needed
                    }

                    // Add the full description to the item object
                    item.description = description;

                    // Add author if static (optional)
                    // item.author = '紫苑寺 有子͜';

                    return item; // Return the enriched item
                })
            )
        );

        // Return the final feed object
        return {
            title: '猫猫博客', // Feed title
            link: baseUrl, // Link to the original website
            description: '猫猫博客 - 动画资源分享,Emby教程,VPS推荐与服务器测评', // Feed description (optional)
            item: items, // Array of feed items
            language: 'zh-Hans', // Language code (optional) [^12]
            // image: 'URL to an image for the feed' (optional) [^12]
            // author: 'Feed Author' (optional) [^12]
        };
    },
};
