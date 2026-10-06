use mx_tg_bot::rich_text::{
    escape_html, escape_markdown_v2, md_to_tg_html, strip_markdown, truncate_with_ellipsis,
};
use serde::Deserialize;

#[derive(Deserialize)]
struct Case {
    input: String,
    output: String,
}

fn cases(json: &str) -> Vec<Case> {
    serde_json::from_str(json).unwrap()
}

#[test]
fn md_to_tg_html_matches_ts_output() {
    let mut failures = Vec::new();
    for case in cases(include_str!("fixtures/rich_text.json")) {
        let actual = md_to_tg_html(&case.input);
        if actual != case.output {
            failures.push(format!(
                "input: {:?}\n  expected: {:?}\n  actual:   {:?}",
                case.input, case.output, actual
            ));
        }
    }
    assert!(failures.is_empty(), "\n{}", failures.join("\n"));
}

#[test]
fn escape_markdown_v2_matches_ts_output() {
    for case in cases(include_str!("fixtures/escape_markdown.json")) {
        assert_eq!(escape_markdown_v2(&case.input), case.output);
    }
}

#[test]
fn escape_html_only_touches_amp_lt_gt() {
    assert_eq!(
        escape_html("a & <b> \"q\" 'q'"),
        "a &amp; &lt;b&gt; \"q\" 'q'"
    );
}

#[test]
fn truncate_counts_utf16_units_and_appends_ellipsis() {
    assert_eq!(truncate_with_ellipsis("abc", 3), "abc");
    assert_eq!(truncate_with_ellipsis("abcd", 3), "ab…");
    assert_eq!(truncate_with_ellipsis("中文字符", 3), "中文…");
    assert_eq!(truncate_with_ellipsis("😀😀😀", 4), "😀…");
    assert_eq!(truncate_with_ellipsis("abc", 1), "a");
}

#[test]
fn strip_markdown_keeps_text_and_paragraph_breaks() {
    assert_eq!(
        strip_markdown("# Title\n\n**bold** [link](https://x.com)\n\n![img](a.png)"),
        "Title\n\nbold link\n\nimg"
    );
}
