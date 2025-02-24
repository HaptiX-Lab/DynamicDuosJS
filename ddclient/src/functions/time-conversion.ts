function timeAgoString(isoString : string) {
    const now = new Date();
    const past = new Date(isoString);
    const diffInSeconds = Math.floor((now - past) / 1000);

    if (diffInSeconds < 60) {
        return `Created ${diffInSeconds} secs ago`;
    }
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return `Created ${diffInMinutes} mins ago`;
    }
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return `Created ${diffInHours} hours ago`;
    }
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
        return `Created ${diffInDays} days ago`;
    }
    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) {
        return `Created ${diffInWeeks} weeks ago`;
    }
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) {
        return `Created ${diffInMonths} months ago`;
    }
    const diffInYears = Math.floor(diffInMonths / 12);
    return `Created ${diffInYears} years ago`;
}

export { timeAgoString }