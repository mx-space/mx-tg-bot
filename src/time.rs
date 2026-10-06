use chrono::{DateTime, Utc};

pub fn relative_time_from_now(time: DateTime<Utc>, now: DateTime<Utc>) -> String {
    const MINUTE: f64 = 60_000.0;
    const HOUR: f64 = MINUTE * 60.0;
    const DAY: f64 = HOUR * 24.0;
    const MONTH: f64 = DAY * 30.0;
    const YEAR: f64 = DAY * 365.0;

    let elapsed = (now - time).num_milliseconds() as f64;
    let (value, unit) = match elapsed {
        e if e < MINUTE => {
            let gap = (e / 1000.0).ceil();
            if gap <= 0.0 {
                return "刚刚".to_string();
            }
            return format!("{gap} 秒");
        }
        e if e < HOUR => (e / MINUTE, "分钟"),
        e if e < DAY => (e / HOUR, "小时"),
        e if e < MONTH => (e / DAY, "天"),
        e if e < YEAR => (e / MONTH, "个月"),
        e => (e / YEAR, "年"),
    };
    format!("{} {unit}", value.round())
}
