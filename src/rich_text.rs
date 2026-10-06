use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};

pub const TG_TEXT_MAX: usize = 4096;
pub const TG_CAPTION_MAX: usize = 1024;
pub const MD_DEFAULT_MAX: usize = 3500;

pub fn escape_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(c),
        }
    }
    out
}

fn escape_text(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

pub fn escape_markdown_v2(input: &str) -> String {
    const SPECIAL: &str = "\\_*[]()~`><&#+-=|{}.!";
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        if SPECIAL.contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

pub fn utf16_len(input: &str) -> usize {
    input.encode_utf16().count()
}

fn take_utf16(input: &str, max: usize) -> &str {
    let mut units = 0;
    for (idx, c) in input.char_indices() {
        units += c.len_utf16();
        if units > max {
            return &input[..idx];
        }
    }
    input
}

pub fn truncate_with_ellipsis(input: &str, max: usize) -> String {
    if utf16_len(input) <= max {
        return input.to_string();
    }
    if max <= 1 {
        return take_utf16(input, max).to_string();
    }
    format!("{}…", take_utf16(input, max - 1))
}

fn safe_href(href: &str) -> Option<String> {
    let trimmed = href.trim();
    let lower = trimmed.to_ascii_lowercase();
    ["http:", "https:", "tg:", "mailto:"]
        .iter()
        .any(|scheme| lower.starts_with(scheme))
        .then(|| escape_html(trimmed))
}

fn autolink(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = find_url_start(rest) {
        out.push_str(&escape_text(&rest[..start]));
        let candidate = &rest[start..];
        let end = candidate
            .find(|c: char| c.is_whitespace() || c == '<')
            .unwrap_or(candidate.len());
        let url = trim_url_tail(&candidate[..end]);
        let escaped = escape_text(url);
        out.push_str(&format!("<a href=\"{escaped}\">{escaped}</a>"));
        rest = &candidate[url.len()..];
    }
    out.push_str(&escape_text(rest));
    out
}

fn find_url_start(text: &str) -> Option<usize> {
    let http = text.find("http://");
    let https = text.find("https://");
    match (http, https) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (a, b) => a.or(b),
    }
}

fn trim_url_tail(url: &str) -> &str {
    let mut end = url.len();
    loop {
        let current = &url[..end];
        let Some(last) = current.chars().last() else {
            break;
        };
        let unbalanced_paren =
            last == ')' && current.matches(')').count() > current.matches('(').count();
        if "?!.,:*_~'\"".contains(last) || unbalanced_paren {
            end -= last.len_utf8();
        } else {
            break;
        }
    }
    &url[..end]
}

fn collapse_newlines(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut run = 0;
    for c in input.chars() {
        if c == '\n' {
            run += 1;
            if run > 2 {
                continue;
            }
        } else {
            run = 0;
        }
        out.push(c);
    }
    out.trim().to_string()
}

fn parser(markdown: &str) -> Parser<'_> {
    let options = Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TABLES | Options::ENABLE_TASKLISTS;
    Parser::new_ext(markdown, options)
}

struct Renderer {
    stack: Vec<(Option<Tag<'static>>, String)>,
    pending_text: String,
    code_block_depth: usize,
    link_depth: usize,
}

impl Renderer {
    fn current(&mut self) -> &mut String {
        &mut self.stack.last_mut().expect("root buffer").1
    }

    fn flush_text(&mut self) {
        if self.pending_text.is_empty() {
            return;
        }
        let text = std::mem::take(&mut self.pending_text);
        let rendered = if self.code_block_depth > 0 {
            escape_html(&text)
        } else if self.link_depth > 0 {
            escape_text(&text)
        } else {
            autolink(&text)
        };
        self.current().push_str(&rendered);
    }

    fn start(&mut self, tag: Tag<'_>) {
        match &tag {
            Tag::CodeBlock(_) => self.code_block_depth += 1,
            Tag::Link { .. } | Tag::Image { .. } => self.link_depth += 1,
            _ => {}
        }
        self.stack.push((Some(tag.into_static()), String::new()));
    }

    fn end(&mut self) {
        let (tag, inner) = self.stack.pop().expect("balanced tags");
        let Some(tag) = tag else { return };
        let rendered = match tag {
            Tag::Paragraph => format!("{inner}\n\n"),
            Tag::Heading { .. } => format!("<b>{inner}</b>\n"),
            Tag::BlockQuote(_) => format!("<blockquote>{}</blockquote>\n", inner.trim()),
            Tag::CodeBlock(kind) => {
                self.code_block_depth -= 1;
                let body = inner.strip_suffix('\n').unwrap_or(&inner);
                let lang = match &kind {
                    CodeBlockKind::Fenced(info) => info.split_whitespace().next().unwrap_or(""),
                    CodeBlockKind::Indented => "",
                };
                if lang.is_empty() {
                    format!("<pre>{body}</pre>\n")
                } else {
                    format!(
                        "<pre><code class=\"language-{}\">{body}</code></pre>\n",
                        escape_html(lang)
                    )
                }
            }
            Tag::List(_) => format!("{inner}\n"),
            Tag::Item => format!("• {inner}\n"),
            Tag::Table(_) | Tag::TableHead | Tag::TableRow | Tag::TableCell => String::new(),
            Tag::Emphasis => format!("<i>{inner}</i>"),
            Tag::Strong => format!("<b>{inner}</b>"),
            Tag::Strikethrough => format!("<s>{inner}</s>"),
            Tag::Link { dest_url, .. } => {
                self.link_depth -= 1;
                match safe_href(&dest_url) {
                    Some(href) => format!("<a href=\"{href}\">{inner}</a>"),
                    None => inner,
                }
            }
            Tag::Image { dest_url, .. } => {
                self.link_depth -= 1;
                let alt = if inner.is_empty() { "image".to_string() } else { inner };
                match safe_href(&dest_url) {
                    Some(href) => format!("<a href=\"{href}\">{alt}</a>"),
                    None => alt,
                }
            }
            _ => inner,
        };
        self.current().push_str(&rendered);
    }
}

pub fn md_to_tg_html(markdown: &str) -> String {
    if markdown.trim().is_empty() {
        return String::new();
    }
    let mut r = Renderer {
        stack: vec![(None, String::new())],
        pending_text: String::new(),
        code_block_depth: 0,
        link_depth: 0,
    };
    for event in parser(markdown) {
        if let Event::Text(text) = &event {
            r.pending_text.push_str(text);
            continue;
        }
        r.flush_text();
        match event {
            Event::Start(tag) => r.start(tag),
            Event::End(_) => r.end(),
            Event::Code(code) => {
                let html = format!("<code>{}</code>", escape_text(&code));
                r.current().push_str(&html);
            }
            Event::Html(html) | Event::InlineHtml(html) => {
                let escaped = escape_html(&html);
                r.current().push_str(&escaped);
            }
            Event::SoftBreak | Event::HardBreak => r.current().push('\n'),
            Event::Rule => r.current().push_str("———\n"),
            Event::TaskListMarker(checked) => {
                r.current().push_str(if checked { "☑ " } else { "☐ " })
            }
            _ => {}
        }
    }
    r.flush_text();
    collapse_newlines(&r.stack.pop().map(|(_, s)| s).unwrap_or_default())
}

pub fn strip_markdown(markdown: &str) -> String {
    let mut out = String::new();
    for event in parser(markdown) {
        match event {
            Event::Text(text) | Event::Code(text) => out.push_str(&text),
            Event::SoftBreak | Event::HardBreak | Event::End(TagEnd::Item) => out.push('\n'),
            Event::End(
                TagEnd::Paragraph | TagEnd::Heading(_) | TagEnd::CodeBlock | TagEnd::BlockQuote(_) | TagEnd::List(_),
            ) => out.push_str("\n\n"),
            _ => {}
        }
    }
    collapse_newlines(&out)
}
