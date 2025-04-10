import { Route, ViewType } from '@/types';
import cache from '@/utils/cache';
import querystring from 'querystring';
import got from '@/utils/got';
import { fallback, queryToBoolean, queryToInteger } from '@/utils/readable-social';
import { config } from '@/config';
import logger from '@/utils/logger'; // 确保导入 logger

export const route: Route = {
    path: '/people/:userid/status/:routeParams?',
    categories: ['social-media', 'popular'],
    view: ViewType.SocialMedia,
    example: '/douban/people/75118396/status',
    parameters: { userid: '整数型用户 id', routeParams: '额外参数；见下' },
    name: '用户广播',
    maintainers: ['alfredcai', 'nczitzk'], // 添加贡献者或保留原样
    handler,
    description: `
::: tip
-   **目前只支持整数型 id**
-   字母型的 id，可以通过头像图片链接来找到其整数型 id，图片命名规则\`ul[userid]-*.jpg\`或\`u[userid]-*.jpg\`，即取文件名中间的数字
-   例如：用户 id: \`MovieL\`他的头像图片链接：\`https://img1.doubanio.com/icon/ul1128221-98.jpg\`他的整数型 id: \`1128221\`
:::

对于豆瓣用户广播内容，在 \`routeParams\` 参数中以 query string 格式设置如下选项可以控制输出的样式

| 键                         | 含义                                                           | 接受的值       | 默认值 |
| -------------------------- | -------------------------------------------------------------- | -------------- | ------ |
| pagesCount                 | 获取多少页广播 (每页20条，豆瓣限制，过多页数可能超时或被阻止)   | 数字           | 3      |
| readable                   | 是否开启细节排版可读性优化                                     | 0/1/true/false | false  |
| authorNameBold             | 是否加粗作者名字                                               | 0/1/true/false | false  |
| showAuthorInTitle          | 是否在标题处显示作者                                           | 0/1/true/false | true   |
| showAuthorInDesc           | 是否在正文处显示作者                                           | 0/1/true/false | false  |
| showAuthorAvatarInDesc     | 是否在正文处显示作者头像（若阅读器会提取正文图片，不建议开启） | 0/1/true/false | false  |
| showEmojiForRetweet        | 显示 “🔁” 取代 “Fw”（转发）                                    | 0/1/true/false | false  |
| showRetweetTextInTitle     | 在标题出显示转发评论（置为 false 则在标题只显示被转发的广播）  | 0/1/true/false | false  |
| addLinkForPics             | 为图片添加可点击的链接                                         | 0/1/true/false | false  |
| showTimestampInDescription | 在正文处显示广播的时间戳                                       | 0/1/true/false | false  |
| showComments               | 在正文处显示评论                                               | 0/1/true/false | false  |
| widthOfPics                | 广播配图宽（生效取决于阅读器）                                 | 不指定 / 数字  | 不指定 |
| heightOfPics               | 广播配图高（生效取决于阅读器）                                 | 不指定 / 数字  | 不指定 |
| sizeOfAuthorAvatar         | 作者头像大小                                                   | 数字           | 48     |

  指定更多与默认值不同的参数选项可以改善 RSS 的可读性，如

  [https://rsshub.app/douban/people/113894409/status/readable=1&authorNameBold=1&showAuthorInTitle=1&showAuthorInDesc=1&showAuthorAvatarInDesc=1&showEmojiForRetweet=1&showRetweetTextInTitle=1&addLinkForPics=1&showTimestampInDescription=1&showComments=1&widthOfPics=100&pagesCount=5](https://rsshub.app/douban/people/113894409/status/readable=1&authorNameBold=1&showAuthorInTitle=1&showAuthorInDesc=1&showAuthorAvatarInDesc=1&showEmojiForRetweet=1&showRetweetTextInTitle=1&addLinkForPics=1&showTimestampInDescription=1&showComments=1&widthOfPics=100&pagesCount=5)

  的效果为

  <img loading="lazy" src="/img/readable-douban.png" alt="豆瓣读书的可读豆瓣广播 RSS" />`,
};

const headers = { Referer: `https://m.douban.com/` };

// --- 辅助函数 tryFixStatus (来自源代码.txt，保持不变) ---
function tryFixStatus(status) {
    let result = { isFixSuccess: true, why: '' };
    const now = new Date();

    if (!status) {
        result = {
            isFixSuccess: false,
            why: '[ 无内容 ]',
        };
        status = {}; // dummy
    } else if (status.deleted) {
        result = {
            isFixSuccess: false,
            why: status.msg ?? '[ 内容已被删除 ]',
        };
    } else if (status.hidden) {
        result = {
            isFixSuccess: false,
            why: status.msg ?? '[ 内容已被设为不可见 ]',
        };
    } else if (status.text === undefined || status.text === null || !status.uri) {
        result = {
            isFixSuccess: false,
            why: status.msg ?? '[ 内容已不可访问 ]',
        };
    } else {
        if (!status.author) {
            status.author = {};
        }
        if (!status.author.url) {
            status.author.url = 'https://www.douban.com/people/1/';
        }
        if (!status.author.name) {
            status.author.name = '[作者不可见]';
        }
        if (!status.author.avatar) {
            status.author.avatar = 'https://img1.doubanio.com/icon/user_normal.jpg';
        }
        if (!status.create_time) {
            status.create_time = now.toLocaleString();
        }
        if (!status.entities) {
            status.entities = [];
        }
    }

    if (status.sharing_url) {
        status.sharing_url = status.sharing_url.split('&')[0];
    }

    if (!result.isFixSuccess) {
        status.sharing_url = 'https://www.douban.com?rsshub_failed=' + now.getTime().toString();
        if (!status.create_time) {
            status.create_time = now.toLocaleString();
        }
    }
    return result;
}

// --- 辅助函数 getContentByActivity (来自源代码.txt，保持不变) ---
function getContentByActivity(ctx, item, params = {}, picsPrefixes = []) {
    const routeParams = querystring.parse(ctx.req.param('routeParams') || ''); // 安全解析

    const mergedParams = {
        readable: fallback(params.readable, queryToBoolean(routeParams.readable), false),
        authorNameBold: fallback(params.authorNameBold, queryToBoolean(routeParams.authorNameBold), false),
        showAuthorInTitle: fallback(params.showAuthorInTitle, queryToBoolean(routeParams.showAuthorInTitle), true),
        showAuthorInDesc: fallback(params.showAuthorInDesc, queryToBoolean(routeParams.showAuthorInDesc), false),
        showAuthorAvatarInDesc: fallback(params.showAuthorAvatarInDesc, queryToBoolean(routeParams.showAuthorAvatarInDesc), false),
        showEmojiForRetweet: fallback(params.showEmojiForRetweet, queryToBoolean(routeParams.showEmojiForRetweet), false),
        showRetweetTextInTitle: fallback(params.showRetweetTextInTitle, queryToBoolean(routeParams.showRetweetTextInTitle), false),
        addLinkForPics: fallback(params.addLinkForPics, queryToBoolean(routeParams.addLinkForPics), false),
        showTimestampInDescription: fallback(params.showTimestampInDescription, queryToBoolean(routeParams.showTimestampInDescription), false),
        showComments: fallback(params.showComments, queryToBoolean(routeParams.showComments), false),
        showColonInDesc: fallback(params.showColonInDesc, null, false), // 注意这里可能需要调整默认值
        widthOfPics: fallback(params.widthOfPics, queryToInteger(routeParams.widthOfPics), -1),
        heightOfPics: fallback(params.heightOfPics, queryToInteger(routeParams.heightOfPics), -1),
        sizeOfAuthorAvatar: fallback(params.sizeOfAuthorAvatar, queryToInteger(routeParams.sizeOfAuthorAvatar), 48),
    };

    params = mergedParams; // 更新 params 为合并后的值

    const {
        readable,
        authorNameBold,
        showAuthorInTitle,
        showAuthorInDesc,
        showAuthorAvatarInDesc,
        showEmojiForRetweet,
        showRetweetTextInTitle,
        addLinkForPics,
        showTimestampInDescription,
        showComments,
        showColonInDesc,
        widthOfPics,
        heightOfPics,
        sizeOfAuthorAvatar,
    } = params;

    const { status, comments } = item;
    // status 可能为 null 或 undefined，增加检查
    if (!status) {
         return {
            title: '[无效条目]',
            description: '[无效条目数据]',
        };
    }
    const { isFixSuccess, why } = tryFixStatus(status);
    if (!isFixSuccess) {
        return {
            title: why,
            description: why,
        };
    }

    let description = '';
    let title = '';
    let activityInDesc;
    let activityInTitle;

    // 增加对 reshared_status 是否存在的检查
    const { isFixSuccess: isResharedFixSuccess, why: resharedWhy } = tryFixStatus(status.reshared_status);

    if (status.activity === '转发') {
        if (isResharedFixSuccess) {
            activityInDesc = '转发 ';
            if (readable && status.reshared_status.author?.url) { // 检查 author 和 url
                activityInDesc += `<a href="${status.reshared_status.author.url}" target="_blank" rel="noopener noreferrer">`;
            }
            if (authorNameBold) {
                activityInDesc += `<strong>`;
            }
            activityInDesc += status.reshared_status.author?.name || '[未知用户]'; // 检查 author 和 name
            if (authorNameBold) {
                activityInDesc += `</strong>`;
            }
            if (readable && status.reshared_status.author?.url) {
                activityInDesc += `</a>`;
            }
            activityInDesc += ` 的广播`;
            activityInTitle = `转发 ${status.reshared_status.author?.name || '[未知用户]'} 的广播`;
        } else {
            activityInDesc = `转发广播`;
            activityInTitle = `转发广播 (${resharedWhy})`; // 可以包含失败原因
        }
    } else {
        activityInDesc = status.activity || '发布'; // 提供默认活动
        activityInTitle = status.activity || '发布';
    }

    if (showAuthorInDesc) {
        let usernameAndAvatar = '';
        if (readable && status.author?.url) { // 检查 author 和 url
            usernameAndAvatar += `<a href="${status.author.url}" target="_blank" rel="noopener noreferrer">`;
        }
        if (showAuthorAvatarInDesc && status.author?.avatar) { // 检查 author 和 avatar
            usernameAndAvatar += `<img width="${sizeOfAuthorAvatar}" height="${sizeOfAuthorAvatar}" src="${status.author.avatar}" ${readable ? 'hspace="8" vspace="8" align="left"' : ''} />`;
        }
        if (authorNameBold) {
            usernameAndAvatar += `<strong>`;
        }
        usernameAndAvatar += status.author?.name || '[未知作者]'; // 检查 author 和 name
        if (authorNameBold) {
            usernameAndAvatar += `</strong>`;
        }
        if (readable && status.author?.url) {
            usernameAndAvatar += `</a>`;
        }
        usernameAndAvatar += `&ensp;`;
        description += usernameAndAvatar + activityInDesc + (showColonInDesc ? ': ' : '');
    }

    if (showAuthorInTitle) {
        title += `${status.author?.name || '[未知作者]'} `; // 检查 author 和 name
    }
    title += `${activityInTitle}: `;

    if (showTimestampInDescription && status.create_time) {
        description += `<br><small>${status.create_time}</small><br>`;
    }

    let text = status.text || ''; // 确保 text 存在
    if (status.entities && status.entities.length > 0) {
        let lastIndex = 0;
        const replacedTextSegements = [];
        try { // 增加 try-catch 防止 entities 数据结构错误导致崩溃
            for (const entity of status.entities) {
                // 检查 entity 结构
                if (typeof entity.start === 'number' && typeof entity.end === 'number' && entity.uri && entity.title) {
                   replacedTextSegements.push(
                        text.slice(lastIndex, entity.start),
                        `<a href="${entity.uri.replace('douban://douban.com', 'https://www.douban.com/doubanapp/dispatch?uri=')}" target="_blank" rel="noopener noreferrer">${entity.title}</a>`
                    );
                    lastIndex = entity.end;
                } else {
                     logger.warn(`Invalid entity structure found in status ${status.id}: ${JSON.stringify(entity)}`);
                }
            }
            replacedTextSegements.push(text.slice(lastIndex));
            text = replacedTextSegements.join('');
        } catch (e) {
            logger.error(`Error processing entities for status ${status.id}: ${e instanceof Error ? e.message : e}`);
            // 发生错误时，保留原始文本
        }
    }

    description += text;

    if (status.card) {
        title += status.card.rating ? `《${status.card.title || '[无标题]'}》` : `「${status.card.title || '[无标题]'}」`;
    }

    // 确保 status.text 存在再处理
    if (status.text && (status.activity !== '转发' || showRetweetTextInTitle)) {
        title += status.text.replace('\n', ' ').substring(0, 100); // 截断标题避免过长
    }

    if (status.images && status.images.length) {
        description += readable ? `<br clear="both" /><div style="clear: both"></div>` : `<br>`;
        let picsPrefix = '';
        for (const image of status.images) {
            const imageUrl = image?.large?.url || image?.normal?.url; // 尝试获取大图或普通图
            if (!imageUrl) {
                continue;
            }
            picsPrefix += `<img width="0" height="0" hidden="true" src="${imageUrl}">`;
        }
        if (picsPrefix) { // 仅当有有效图片时才添加
            picsPrefixes.push(picsPrefix);
        }

        for (const image of status.images) {
            const imageUrl = image?.large?.url || image?.normal?.url; // 再次获取
            if (!imageUrl) {
                description += '[无法显示的图片]';
                continue;
            }
            if (addLinkForPics) {
                description += `<a href="${imageUrl}" target="_blank" rel="noopener noreferrer">`;
            }
            if (!readable) {
                description += '<br>';
            }
            let style = '';
            let imgTag = '<img ';
            if (widthOfPics >= 0) {
                imgTag += ` width="${widthOfPics}"`;
                style += `width: ${widthOfPics}px;`;
            }
            if (heightOfPics >= 0) {
                imgTag += ` height="${heightOfPics}" `;
                style += `height: ${heightOfPics}px;`;
            }
            // 添加 max-width 避免图片撑破容器
            style += 'max-width: 100%; height: auto;';
            imgTag += ` style="${style}" ` + (readable ? 'vspace="8" hspace="4" ' : '') + ` src="${imageUrl}" alt="图片" loading="lazy">`; // 添加 alt 和 lazy loading
            description += imgTag;
            if (addLinkForPics) {
                description += '</a>';
            }
        }
    }

    if (status.video_info) {
        description += readable ? `<br clear="both" /><div style="clear: both"></div>` : `<br>`;
        const videoCover = status.video_info.cover_url;
        const videoSrc = status.video_info.video_url;
        if (videoSrc) {
            // 提供更丰富的视频标签
            description += `
                <video controls preload="metadata" ${videoCover ? `poster="${videoCover}"` : ''} style="max-width: 100%;">
                    <source src="${videoSrc}" type="video/mp4">
                    您的浏览器不支持视频标签。
                </video>
            `;
        } else if (videoCover) {
            // 只有封面时显示封面
            description += `<img src="${videoCover}" alt="视频封面" style="max-width: 100%;">`;
        }
    }

    // 增加对 parent_status 是否存在的检查
    if (status.parent_status) {
        description += showEmojiForRetweet ? ' 🔁 ' : ' Fw: ';
        if (showRetweetTextInTitle) {
            title += showEmojiForRetweet ? ' 🔁 ' : ' Fw: ';
        }

        const { isFixSuccess: isParentFixSuccess, why: parentWhy } = tryFixStatus(status.parent_status);

        if (isParentFixSuccess) {
            let usernameAndAvatar = '';
            if (readable && status.parent_status.author?.url) {
                usernameAndAvatar += `<a href="${status.parent_status.author.url}" target="_blank" rel="noopener noreferrer">`;
            }
            if (authorNameBold) {
                usernameAndAvatar += `<strong>`;
            }
            usernameAndAvatar += status.parent_status.author?.name || '[未知用户]';
            if (authorNameBold) {
                usernameAndAvatar += `</strong>`;
            }
            if (readable && status.parent_status.author?.url) {
                usernameAndAvatar += `</a>`;
            }
            usernameAndAvatar += `:&ensp;`;
            // 确保 parent_status.text 存在
            description += usernameAndAvatar + (status.parent_status.text || '[原动态无文字]');
            if (showRetweetTextInTitle && status.parent_status.text) {
                 title += `${status.parent_status.author?.name || '[未知用户]'}: ${status.parent_status.text.replace('\n', ' ').substring(0, 50)}`; // 截断
            } else if (showRetweetTextInTitle) {
                title += `${status.parent_status.author?.name || '[未知用户]'}: [原动态无文字]`;
            }
        } else {
            description += parentWhy;
            if (showRetweetTextInTitle) {
                title += parentWhy;
            }
        }
    }

    if (status.card) {
        let image;
        if (status.card.image && (status.card.image.large || status.card.image.normal)) {
            image = status.card.image.large || status.card.image.normal;
        }

        description += readable ? `<br clear="both" /><div style="clear: both"></div><blockquote style="background: #f9f9f9; border-left: 5px solid #ccc; margin: 10px 0; padding: 10px 15px;">` : `<br>`; // 改进样式
        if (image?.url) { // 检查 url
            description += `<img src="${image.url}" ${readable ? 'vspace="0" hspace="12" align="left" height="75" style="height: 75px; margin-right: 10px;"' : ''} alt="卡片图片" loading="lazy"/>`;
        }

        const cardTitle = status.card.title || '[无标题]';
        const cardSubtitle = status.card.subtitle || ''; // 副标题可能为空
        const cardUrl = status.card.url || '#'; // 提供默认链接

        description += `<a href="${cardUrl}" target="_blank" rel="noopener noreferrer"><strong>${cardTitle}</strong>${cardSubtitle ? `<br><small>${cardSubtitle}</small>`: ''}`;
        if (status.card.rating?.value) { // 检查 rating 和 value
            description += `<br><small>评分：${status.card.rating.value}</small>`;
        }
        description += `</a>`;
        if (readable) {
            description += `<br clear="both" /><div style="clear: both"></div></blockquote>`;
        }
    }

    if (status.video_card) {
        description += readable ? `<br clear="both" /><div style="clear: both"></div><blockquote style="background: #f9f9f9; border-left: 5px solid #ccc; margin: 10px 0; padding: 10px 15px;">` : `<br>`;
        const videoCover = status.video_card.video_info?.cover_url;
        const videoSrc = status.video_card.video_info?.video_url;
        const videoUrl = status.video_card.url || '#';
        const videoTitle = status.video_card.title;

        if (videoSrc) {
             description += `
                <video controls preload="metadata" ${videoCover ? `poster="${videoCover}"` : ''} style="max-width: 100%;">
                    <source src="${videoSrc}" type="video/mp4">
                    您的浏览器不支持视频标签。
                </video><br>`;
        } else if (videoCover) {
             description += `<img src="${videoCover}" alt="视频卡片封面" style="max-width: 100%;"><br>`;
        }

        if (videoTitle) {
             description += `<a href="${videoUrl}" target="_blank" rel="noopener noreferrer">${videoTitle}</a>`;
        }

        if (readable) {
            description += `</blockquote>`;
        }
    }

    // 增加对 reshared_status 的检查
    if (status.reshared_status) {
        description += readable ? `<br clear="both" /><div style="clear: both"></div><blockquote style="background: #f0f0f0; border-left: 5px solid #aaa; margin: 10px 0; padding: 10px 15px;">` : `<br>`; // 转发样式区分

        // 确保 isResharedFixSuccess 在此作用域可用
        // const { isFixSuccess: isResharedFixSuccess, why: resharedWhy } = tryFixStatus(status.reshared_status); // 重复检查？应使用上面已有的

        if (showRetweetTextInTitle) {
            title += ' | ';
        }

        if (isResharedFixSuccess) {
            // 递归调用，传递必要的参数，并禁用评论和修改头像显示
             const resharedContent = getContentByActivity(
                ctx,
                { status: status.reshared_status, comments: [] }, // 传递空的 comments
                {
                    ...params, // 继承父级参数
                    showAuthorInDesc: true,
                    showAuthorAvatarInDesc: false, // 不在转发内容里显示头像
                    showComments: false, // 不显示评论
                    showColonInDesc: true,
                },
                picsPrefixes // 传递 picsPrefixes
            );
            description += resharedContent.description;
            // 确保 reshared_status.text 存在
            title += (status.reshared_status.text || '[原动态无文字]').replace('\n', ' ').substring(0, 50); // 截断

            const reshared_url = status.reshared_status.uri ? status.reshared_status.uri.replace('douban://douban.com', 'https://www.douban.com/doubanapp/dispatch?uri=') : '#'; // 提供 fallback
            if (readable) {
                description += `<br><small>原动态：<a href="${reshared_url}" target="_blank" rel="noopener noreferrer">${reshared_url}</a></small>`;
            }
        } else {
            description += resharedWhy;
            title += resharedWhy;
        }
         if (readable) {
             description += `<br clear="both" /><div style="clear: both"></div></blockquote>`; // 结束 blockquote
         }
    }

    if (showComments && comments && comments.length > 0) {
        description += '<hr style="border: none; border-top: 1px dashed #ccc; margin: 10px 0;">'; // 改进分隔线样式
        description += '<strong>评论:</strong><ul style="list-style: none; padding-left: 15px;">';
        for (const comment of comments) {
            if (comment?.text && comment?.author?.name && comment?.author?.url) { // 检查评论数据
                description += `<li style="margin-bottom: 5px;">${comment.text} - <a href="${comment.author.url}" target="_blank" rel="noopener noreferrer">${comment.author.name}</a></li>`;
            }
        }
        description += '</ul>';
    }

    if (showAuthorInDesc && showAuthorAvatarInDesc && picsPrefixes.length > 0) { // 检查 picsPrefixes 是否有内容
        description = picsPrefixes.join('') + description;
    }

    // 清理可能产生的多余换行和首尾空格
    description = description.trim().replaceAll('\n', '<br>').replace(/(<br>\s*){3,}/g, '<br><br>'); // 最多保留两个换行

    return { title: title.trim(), description }; // 返回前 trim 标题
}

// --- 辅助函数 getFullTextItems (来自源代码.txt，稍作修改以增强日志和错误处理) ---
async function getFullTextItems(items) {
    const prefix = 'https://m.douban.com/rexxar/api/v2/status/';

    // 使用 Promise.allSettled 来处理部分失败的情况
    const results = await Promise.allSettled(
        (items || []).map(async (item) => { // 确保 items 是数组
            if (!item?.status?.id) {
                 logger.warn('Skipping item with invalid status or id in getFullTextItems');
                 return; // 跳过无效项
            }

            let url = prefix + item.status.id;
            let cacheResult = await cache.get(url); // 不需要 tryGet，内部处理

            if (cacheResult) {
                item.status.text = cacheResult;
                logger.debug(`Full text cache hit for status ${item.status.id}`);
            } else {
                try {
                    logger.debug(`Fetching full text for status ${item.status.id} from ${url}`);
                    const { data } = await got({ url, headers });
                    const text = data?.text; // 安全获取 text
                    if (typeof text === 'string') { // 确保获取到的是字符串
                       await cache.set(url, text); // 存入缓存前检查
                       item.status.text = text;
                    } else {
                        logger.warn(`Received non-string text for status ${item.status.id}`);
                        // 可以选择保留原有短文本或设置为空
                        // item.status.text = item.status.text || '';
                    }
                } catch (error) {
                    logger.error(`Failed to fetch full text for status ${item.status.id}: ${error instanceof Error ? error.message : error}`);
                    // 保留原有文本或添加失败标记
                    item.status.text = item.status.text ? `${item.status.text}\n[获取全文失败]` : '[获取全文失败]';
                }
            }

            // 处理转发的原文
            if (!item.status.reshared_status?.id) { // 检查转发状态和ID
                return;
            }

            url = prefix + item.status.reshared_status.id;
            cacheResult = await cache.get(url);

            if (cacheResult) {
                item.status.reshared_status.text = cacheResult;
                logger.debug(`Full reshared text cache hit for status ${item.status.reshared_status.id}`);
            } else if (tryFixStatus(item.status.reshared_status).isFixSuccess) { // 确保转发状态本身有效
                try {
                    logger.debug(`Fetching full reshared text for status ${item.status.reshared_status.id} from ${url}`);
                    const { data } = await got({ url, headers });
                    const text = data?.text;
                    if (typeof text === 'string') {
                        await cache.set(url, text);
                        item.status.reshared_status.text = text;
                    } else {
                        logger.warn(`Received non-string reshared text for status ${item.status.reshared_status.id}`);
                    }
                } catch (error) {
                    logger.error(`Failed to fetch full reshared text for status ${item.status.reshared_status.id}: ${error instanceof Error ? error.message : error}`);
                    item.status.reshared_status.text = item.status.reshared_status.text ? `${item.status.reshared_status.text}\n[获取原动态全文失败]` : '[获取原动态全文失败]';
                }
            }
        })
    );

    // 可以选择性地记录失败的 Promise
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            logger.error(`Error processing item index ${index} in getFullTextItems: ${result.reason}`);
        }
    });
}


// --- 主处理函数 handler (使用你的多页逻辑) ---
async function handler(ctx) {
    const userid = ctx.req.param('userid');
    const routeParams = querystring.parse(ctx.req.param('routeParams') || ''); // 安全解析

    // 从路由参数中获取页数设置，默认为3页
    const maxPages = queryToInteger(routeParams.pagesCount) || 3;
    const countPerPage = 20; // 豆瓣每页默认条目数
    const delaySeconds = 1; // 请求间隔秒数，避免过快

    logger.info(`Fetching Douban statuses for user ${userid}, max pages: ${maxPages}`);

    // 存储所有获取到的条目
    let allItems = [];
    let hasMore = true;
    let currentPage = 0;
    const fetchedUrls = new Set(); // 跟踪已请求的 URL，防止无限循环（如果豆瓣API行为异常）

    // 分页获取数据
    while (currentPage < maxPages && hasMore) {
        const start = currentPage * countPerPage;
        const url = `https://m.douban.com/rexxar/api/v2/status/user_timeline/${userid}?start=${start}&count=${countPerPage}`;

        if (fetchedUrls.has(url)) {
            logger.warn(`URL ${url} has already been fetched. Stopping to prevent infinite loop.`);
            break;
        }
        fetchedUrls.add(url);

        try {
            // 为每页单独缓存，使用更明确的键
            const cacheKey = `douban:user:${userid}:timeline:page:${currentPage}`;
            logger.debug(`[Page ${currentPage + 1}/${maxPages}] Trying cache for: ${cacheKey}`);

            const pageItems = await cache.tryGet(
                cacheKey,
                async () => {
                    logger.debug(`[Page ${currentPage + 1}/${maxPages}] Cache miss. Fetching data from: ${url}`);
                    const response = await got({ url, headers }); // 确保传递 headers
                    // 检查返回的数据结构是否符合预期
                    if (response?.data?.items && Array.isArray(response.data.items)) {
                         return response.data.items;
                    } else {
                        logger.warn(`[Page ${currentPage + 1}/${maxPages}] Unexpected response structure from ${url}: ${JSON.stringify(response?.data)}`);
                        return []; // 返回空数组避免后续错误
                    }
                },
                config.cache.routeExpire || 3600, // 提供默认缓存时间 (例如 1 小时)
                false
            );

            if (pageItems && pageItems.length > 0) {
                // 过滤掉可能存在的重复项（基于 id）
                const newItems = pageItems.filter(newItem => newItem?.status?.id && !allItems.some(existingItem => existingItem?.status?.id === newItem.status.id));
                allItems = allItems.concat(newItems);
                logger.debug(`[Page ${currentPage + 1}/${maxPages}] Fetched ${pageItems.length} items (${newItems.length} new). Total items: ${allItems.length}`);

                // 如果获取的条目数少于每页条目数，说明没有更多数据了
                if (pageItems.length < countPerPage) {
                    hasMore = false;
                    logger.info(`[Page ${currentPage + 1}/${maxPages}] Reached end of timeline (fetched ${pageItems.length} < ${countPerPage}).`);
                }
            } else {
                // 没有数据，结束循环
                hasMore = false;
                logger.info(`[Page ${currentPage + 1}/${maxPages}] No items found on this page. Stopping.`);
            }

            currentPage++;

            // 添加延迟，避免请求过快
            if (hasMore && currentPage < maxPages) {
                logger.debug(`Delaying for ${delaySeconds} second(s) before fetching page ${currentPage + 1}...`);
                await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000)); // 延迟
            }
        } catch (error) {
            logger.error(`[Page ${currentPage + 1}/${maxPages}] Failed to fetch data for user ${userid}: ${error instanceof Error ? error.message : error}`);
            // 可以选择记录错误栈信息
            if (error instanceof Error && error.stack) {
                logger.debug(error.stack);
            }
            hasMore = false; // 出错则停止后续页的获取
        }
    }

    logger.info(`Finished fetching timeline for user ${userid}. Total items collected: ${allItems.length} across ${currentPage} pages.`);

    // 获取完整内容
    if (allItems && allItems.length > 0) {
        logger.debug(`Fetching full text for ${allItems.length} items...`);
        try {
            await getFullTextItems(allItems); // 调用辅助函数获取全文
            logger.debug(`Full text fetching process completed.`);
        } catch (error) {
             logger.error(`Error during getFullTextItems for user ${userid}: ${error instanceof Error ? error.message : error}`);
             // 即使获取全文失败，也继续返回部分数据
        }
    }

    // 安全地获取作者名
    const authorName = allItems?.[0]?.status?.author?.name || userid;

    return {
        title: `豆瓣广播 - ${authorName}`,
        link: `https://m.douban.com/people/${userid}/statuses`,
        item: (allItems || []) // 处理 allItems 可能为 null 或 undefined
            .filter((item) => item?.status && !item.deleted) // 过滤无效或已删除条目
            .map((item) => {
                try {
                    // 使用辅助函数处理内容和格式
                    const r = getContentByActivity(ctx, item);
                    // 优化 link 获取，添加 status id 作为 fallback
                    const link = item.status.sharing_url
                        ? item.status.sharing_url.replace(/\?_i=.*$/, '') // 更精确地移除查询参数
                        : item.status.uri // 尝试使用 uri
                          ? item.status.uri.replace('douban://douban.com', 'https://www.douban.com/doubanapp/dispatch?uri=')
                          : `https://m.douban.com/people/${userid}/status/${item.status.id}`; // 使用 status id 作为最终 fallback

                    // 安全地处理时间戳
                    let pubDate;
                    if (item.status.create_time) {
                        try {
                           // 尝试解析时间，注意豆瓣时间格式可能不完全标准
                           pubDate = new Date(item.status.create_time.replace(' ', 'T') + '+08:00').toUTCString();
                           // 简单验证日期是否有效
                           if (isNaN(Date.parse(pubDate))) {
                               pubDate = undefined; // 无效日期则重置
                               logger.warn(`Invalid date format encountered: ${item.status.create_time}`);
                           }
                        } catch (dateError) {
                             logger.warn(`Error parsing date "${item.status.create_time}": ${dateError}`);
                             pubDate = undefined; // 解析出错也重置
                        }
                    }

                    return {
                        // 提供 fallback 值
                        title: r.title || '[无标题]',
                        link: link,
                        // 如果 pubDate 无效，RSS阅读器通常会忽略它或使用当前时间
                        ...(pubDate && { pubDate }), // 仅当 pubDate 有效时才包含它
                        description: r.description || '[无描述]',
                        // 可以考虑添加 guid
                        guid: `douban-status-${item.status.id}`, // 使用 status id 作为唯一标识符
                        // 可以考虑添加作者信息
                        author: item.status.author?.name,
                    };
                } catch (mapError) {
                     logger.error(`Error processing item ${item?.status?.id} for user ${userid}: ${mapError instanceof Error ? mapError.message : mapError}`);
                     return null; // 遇到处理错误时返回 null
                }
            })
            .filter(Boolean), // 过滤掉处理失败的 null 项
    };
}
