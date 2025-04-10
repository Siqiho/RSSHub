// 从路由参数中获取页数设置，默认为3页
const maxPages = queryToInteger(routeParams.pagesCount) || 3;
const countPerPage = 20; // 豆瓣每页默认条目数

// 存储所有获取到的条目
let allItems = [];
let hasMore = true;
let currentPage = 0;

// 分页获取数据
while (currentPage < maxPages && hasMore) {
    const start = currentPage * countPerPage;
    const url = `https://m.douban.com/rexxar/api/v2/status/user_timeline/${userid}?start=${start}&count=${countPerPage}`;
    
    try {
        // 为每页单独缓存
        const pageItems = await cache.tryGet(
            `douban:user:${userid}:status:page:${currentPage}`,
            async () => {
                const response = await got({ url, headers });
                return response.data.items || [];
            },
            config.cache.routeExpire,
            false
        );
        
        if (pageItems && pageItems.length > 0) {
            allItems = allItems.concat(pageItems);
            
            // 如果获取的条目数少于每页条目数，说明没有更多数据了
            if (pageItems.length < countPerPage) {
                hasMore = false;
            }
        } else {
            // 没有数据，结束循环
            hasMore = false;
        }
        
        currentPage++;
        
        // 添加延迟，避免请求过快
        if (hasMore && currentPage < maxPages) {
            await new Promise((resolve) => setTimeout(resolve, 2000)); // 延迟2秒
        }
    } catch (error) {
        logger.error(`获取第${currentPage}页数据失败: ${error.message}`);
        hasMore = false; // 出错则停止
    }
}

// 获取完整内容
if (allItems && allItems.length > 0) {
    await getFullTextItems(allItems);
}

return {
    title: `豆瓣广播 - ${allItems && allItems.length > 0 && allItems[0].status && allItems[0].status.author ? allItems[0].status.author.name : userid}`,
    link: `https://m.douban.com/people/${userid}/statuses`,
    item:
        allItems &&
        allItems
            .filter((item) => item && !item.deleted && item.status)
            .map((item) => {
                const r = getContentByActivity(ctx, item);
                const link = item.status.sharing_url ? item.status.sharing_url.replace(/\?_i=(.*)/, '') : `https://m.douban.com/people/${userid}/status`;
                const pubDate = item.status.create_time ? new Date(Date.parse(item.status.create_time + ' GMT+0800')).toUTCString() : new Date().toUTCString();
                
                return {
                    title: r.title,
                    link: link,
                    pubDate: pubDate,
                    description: r.description,
                };
            }),
};
