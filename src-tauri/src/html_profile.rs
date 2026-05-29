use dom_query::Document;
use std::ops::Range;

#[derive(Clone, Debug, Default)]
pub struct NoteHtmlMetadata {
    pub id: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub title: Option<String>,
    pub first_h1: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NoteHeading {
    pub level: u8,
    pub text: String,
    pub id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NoteLink {
    pub href: String,
    pub label: String,
    pub target_id: Option<String>,
    pub is_broken: bool,
    pub kind: String,
    pub target_heading: Option<String>,
    pub target_block_id: Option<String>,
    pub concept: Option<String>,
    pub fragment: Option<String>,
    pub unresolved: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NoteAssetReference {
    pub source: String,
    pub element: String,
    pub attribute: String,
}

#[derive(Clone, Debug, Default)]
pub struct NoteTargetInventory {
    pub headings: Vec<String>,
    pub heading_ids: Vec<String>,
    pub block_ids: Vec<String>,
    pub element_ids: Vec<String>,
}

#[derive(Clone, Debug, Default)]
pub struct NoteHtmlInspection {
    pub metadata: NoteHtmlMetadata,
    pub has_html: bool,
    pub has_body: bool,
    pub has_note_article: bool,
    pub headings: Vec<NoteHeading>,
    pub links: Vec<NoteLink>,
    pub tags: Vec<String>,
    pub body_text: String,
    pub article_text: String,
    pub asset_references: Vec<NoteAssetReference>,
    pub target_inventory: NoteTargetInventory,
}

#[derive(Debug)]
pub struct LinkMetadata {
    pub kind: String,
    pub target_heading: Option<String>,
    pub target_block_id: Option<String>,
    pub concept: Option<String>,
}

#[derive(Clone, Debug)]
struct ParsedAttr {
    name: String,
    value: Option<String>,
    value_range: Option<Range<usize>>,
}

pub fn parse_note_html(html: &str) -> Document {
    Document::from(html)
}

pub fn inspect_note_html(html: &str) -> NoteHtmlInspection {
    let document = parse_note_html(html);
    let metadata = extract_note_metadata_from_document(&document);
    let headings = extract_heading_details_from_document(&document);
    let article_text = article_text_from_document(&document);
    let body_text = plain_text_from_document(&document);
    let links = extract_links_from_document(&document);
    let tags = extract_tags_from_document(&document, &body_text);
    let target_inventory = target_inventory_from_document(&document, &headings);
    let asset_references = extract_asset_references_from_document(&document);

    NoteHtmlInspection {
        metadata,
        has_html: contains_start_tag(html, "html"),
        has_body: contains_start_tag(html, "body"),
        has_note_article: document.select("article[data-opaline-note]").exists(),
        headings,
        links,
        tags,
        body_text,
        article_text,
        asset_references,
        target_inventory,
    }
}

pub fn extract_note_metadata(html: &str) -> NoteHtmlMetadata {
    let document = parse_note_html(html);
    extract_note_metadata_from_document(&document)
}

pub fn extract_note_links(html: &str) -> Vec<NoteLink> {
    let document = parse_note_html(html);
    extract_links_from_document(&document)
}

pub fn extract_note_tags(html: &str) -> Vec<String> {
    let document = parse_note_html(html);
    let body_text = plain_text_from_document(&document);
    extract_tags_from_document(&document, &body_text)
}

pub fn extract_note_headings(html: &str) -> Vec<String> {
    extract_note_heading_details(html)
        .into_iter()
        .map(|heading| heading.text)
        .collect()
}

pub fn extract_note_heading_details(html: &str) -> Vec<NoteHeading> {
    let document = parse_note_html(html);
    extract_heading_details_from_document(&document)
}

pub fn plain_text_from_html(html: &str) -> String {
    let document = parse_note_html(html);
    plain_text_from_document(&document)
}

pub fn meta_content(html: &str, name: &str) -> Option<String> {
    let document = parse_note_html(html);
    meta_content_from_document(&document, name)
}

pub fn title_content(html: &str) -> Option<String> {
    let document = parse_note_html(html);
    text_for_first(&document, "title")
}

pub fn first_heading_content(html: &str) -> Option<String> {
    let document = parse_note_html(html);
    first_h1_from_document(&document)
}

pub fn document_has_complete_html(html: &str) -> bool {
    let inspection = inspect_note_html(html);
    inspection.has_html && inspection.has_body
}

pub fn document_has_note_article(html: &str) -> bool {
    let document = parse_note_html(html);
    document.select("article[data-opaline-note]").exists()
}

pub fn upsert_meta_content(html: &str, name: &str, content: &str) -> String {
    if let Some(updated) = replace_existing_meta_content(html, name, content) {
        return updated;
    }

    insert_into_head(
        html,
        &format!(
            "    <meta name=\"{}\" content=\"{}\">\n",
            escape_attr(name),
            escape_attr(content)
        ),
    )
}

pub fn normalize_updated_meta_for_compare(html: &str) -> String {
    replace_existing_meta_content(html, "opaline:updated", "__opaline_updated__")
        .unwrap_or_else(|| html.to_string())
}

pub fn ensure_title(html: &str, fallback_title: &str) -> String {
    if title_content(html).is_some() {
        return html.to_string();
    }

    insert_into_head(
        html,
        &format!("    <title>{}</title>\n", escape_text(fallback_title)),
    )
}

pub fn replace_title_text(html: &str, title: &str) -> String {
    replace_first_element_inner(html, "title", &escape_text(title)).unwrap_or_else(|| {
        insert_into_head(
            html,
            &format!("    <title>{}</title>\n", escape_text(title)),
        )
    })
}

pub fn replace_first_h1_if_text_matches(
    html: &str,
    expected_text: &str,
    replacement: &str,
) -> String {
    let Some(current_h1) = first_heading_content(html) else {
        return html.to_string();
    };
    if current_h1.trim() != expected_text.trim() {
        return html.to_string();
    }
    replace_first_element_inner(html, "h1", &escape_text(replacement))
        .unwrap_or_else(|| html.to_string())
}

pub fn link_metadata_from_parts(
    href: &str,
    explicit_kind: Option<String>,
    target_heading: Option<String>,
    target_block_id: Option<String>,
    concept: Option<String>,
    label: &str,
) -> LinkMetadata {
    let kind = normalize_link_kind(explicit_kind.as_deref());
    let fragment = href_fragment(href);
    let concept_from_href = href
        .strip_prefix("opaline://concept/")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let concept = concept.or(concept_from_href);

    if kind.as_deref() == Some("concept") || concept.is_some() {
        let concept = concept.or_else(|| {
            let trimmed = label.trim().trim_start_matches('#').trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        });
        return LinkMetadata {
            kind: "concept".to_string(),
            target_heading: None,
            target_block_id: None,
            concept,
        };
    }

    if kind.as_deref() == Some("block")
        || target_block_id.is_some()
        || fragment.as_deref().is_some_and(is_block_fragment)
    {
        let block =
            target_block_id.or_else(|| fragment.as_deref().map(normalize_block_fragment_value));
        return LinkMetadata {
            kind: "block".to_string(),
            target_heading: None,
            target_block_id: block,
            concept: None,
        };
    }

    if kind.as_deref() == Some("heading") || target_heading.is_some() || fragment.is_some() {
        let heading =
            target_heading.or_else(|| fragment.as_deref().map(normalize_heading_fragment_value));
        return LinkMetadata {
            kind: "heading".to_string(),
            target_heading: heading,
            target_block_id: None,
            concept: None,
        };
    }

    LinkMetadata {
        kind: "note".to_string(),
        target_heading: None,
        target_block_id: None,
        concept: None,
    }
}

pub fn href_fragment(href: &str) -> Option<String> {
    href.split_once('#')
        .map(|(_, fragment)| fragment.trim())
        .filter(|fragment| !fragment.is_empty())
        .map(|fragment| fragment.to_string())
}

pub fn is_external_href(href: &str) -> bool {
    let lower = href.trim().to_ascii_lowercase();
    lower.starts_with("http:")
        || lower.starts_with("https:")
        || lower.starts_with("mailto:")
        || lower.starts_with("tel:")
        || lower.starts_with("data:")
        || lower.starts_with("javascript:")
}

pub fn is_note_html_href(href: &str) -> bool {
    let href = href_path_without_suffix(href);
    !href.is_empty() && href.to_ascii_lowercase().ends_with(".html")
}

pub fn is_local_asset_reference(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty()
        && !value.starts_with('#')
        && !is_external_href(value)
        && !value.starts_with("opaline://")
        && !is_note_html_href(value)
}

pub fn href_path_without_suffix(href: &str) -> &str {
    href.split(['#', '?']).next().unwrap_or(href).trim()
}

pub fn normalize_heading_fragment_value(fragment: &str) -> String {
    fragment.trim_start_matches('^').replace('-', " ")
}

pub fn normalize_block_fragment_value(fragment: &str) -> String {
    fragment.trim_start_matches('^').to_string()
}

fn extract_note_metadata_from_document(document: &Document) -> NoteHtmlMetadata {
    NoteHtmlMetadata {
        id: meta_content_from_document(document, "opaline:id"),
        created_at: meta_content_from_document(document, "opaline:created"),
        updated_at: meta_content_from_document(document, "opaline:updated"),
        title: text_for_first(document, "title"),
        first_h1: first_h1_from_document(document),
    }
}

fn extract_heading_details_from_document(document: &Document) -> Vec<NoteHeading> {
    let mut headings = Vec::new();
    for node in document.select("h1, h2, h3, h4, h5, h6").iter() {
        let text = collapse_whitespace(&node.text());
        if text.is_empty() {
            continue;
        }
        let nodes = node.nodes();
        let level = nodes
            .first()
            .and_then(|node| node.node_name())
            .and_then(|name| name.chars().nth(1))
            .and_then(|ch| ch.to_digit(10))
            .unwrap_or(1)
            .clamp(1, 6) as u8;
        headings.push(NoteHeading {
            level,
            text,
            id: node
                .attr("id")
                .map(clean_attr_value)
                .filter(|value| !value.is_empty()),
        });
    }
    headings
}

fn extract_links_from_document(document: &Document) -> Vec<NoteLink> {
    let mut links = Vec::new();
    for node in document.select("a[href]").iter() {
        let href = node.attr("href").map(clean_attr_value).unwrap_or_default();
        if href.is_empty() {
            continue;
        }
        let label = collapse_whitespace(&node.text());
        let target_id = node
            .attr("data-opaline-link")
            .map(clean_attr_value)
            .filter(|value| !value.is_empty());
        let target_block_id = node
            .attr("data-opaline-block-id")
            .or_else(|| node.attr("data-opaline-block-ref"))
            .map(clean_attr_value)
            .filter(|value| !value.is_empty());
        let meta = link_metadata_from_parts(
            &href,
            node.attr("data-opaline-link-kind").map(clean_attr_value),
            node.attr("data-opaline-heading").map(clean_attr_value),
            target_block_id,
            node.attr("data-opaline-concept").map(clean_attr_value),
            &label,
        );
        links.push(NoteLink {
            fragment: href_fragment(&href),
            href,
            label,
            target_id,
            is_broken: false,
            kind: meta.kind,
            target_heading: meta.target_heading,
            target_block_id: meta.target_block_id,
            concept: meta.concept,
            unresolved: false,
        });
    }

    for node in document.select("[data-opaline-unresolved]").iter() {
        let unresolved = node
            .attr("data-opaline-unresolved")
            .map(clean_attr_value)
            .unwrap_or_else(|| {
                collapse_whitespace(&node.text())
                    .trim_matches(['[', ']'])
                    .to_string()
            });
        if unresolved.is_empty() {
            continue;
        }
        links.push(NoteLink {
            href: format!("[[{unresolved}]]"),
            label: unresolved,
            target_id: None,
            is_broken: true,
            kind: "note".to_string(),
            target_heading: None,
            target_block_id: None,
            concept: None,
            fragment: None,
            unresolved: true,
        });
    }

    links
}

fn extract_tags_from_document(document: &Document, body_text: &str) -> Vec<String> {
    let mut tags = Vec::new();
    for node in document.select("[data-opaline-tag]").iter() {
        if let Some(tag) = node.attr("data-opaline-tag").map(clean_attr_value) {
            push_unique(&mut tags, tag);
        }
    }

    for word in body_text.split_whitespace() {
        if let Some(tag) = word.strip_prefix('#') {
            let tag = tag.trim_matches(|c: char| !c.is_alphanumeric()).to_string();
            if !tag.is_empty() {
                push_unique(&mut tags, tag);
            }
        }
    }
    tags
}

fn extract_asset_references_from_document(document: &Document) -> Vec<NoteAssetReference> {
    let mut refs = Vec::new();
    for (selector, attribute) in [
        ("img[src]", "src"),
        ("source[src]", "src"),
        ("video[src]", "src"),
        ("audio[src]", "src"),
        ("iframe[src]", "src"),
        ("embed[src]", "src"),
        ("object[data]", "data"),
        ("a[href]", "href"),
    ] {
        for node in document.select(selector).iter() {
            let Some(source) = node.attr(attribute).map(clean_attr_value) else {
                continue;
            };
            if !is_local_asset_reference(&source) {
                continue;
            }
            let element = selector.split('[').next().unwrap_or("element").to_string();
            refs.push(NoteAssetReference {
                source,
                element,
                attribute: attribute.to_string(),
            });
        }
    }
    refs
}

fn target_inventory_from_document(
    document: &Document,
    headings: &[NoteHeading],
) -> NoteTargetInventory {
    let mut inventory = NoteTargetInventory {
        headings: headings
            .iter()
            .map(|heading| heading.text.clone())
            .collect(),
        heading_ids: headings
            .iter()
            .filter_map(|heading| heading.id.clone())
            .collect(),
        block_ids: Vec::new(),
        element_ids: Vec::new(),
    };

    for node in document.select("[id]").iter() {
        if let Some(id) = node
            .attr("id")
            .map(clean_attr_value)
            .filter(|value| !value.is_empty())
        {
            push_unique(&mut inventory.element_ids, id.clone());
            if node.has_attr("data-opaline-block") || is_block_fragment(&id) {
                push_unique(&mut inventory.block_ids, id);
            }
        }
    }
    for node in document.select("[data-opaline-block-id]").iter() {
        if let Some(id) = node
            .attr("data-opaline-block-id")
            .map(clean_attr_value)
            .filter(|value| !value.is_empty())
        {
            push_unique(&mut inventory.block_ids, id);
        }
    }

    inventory
}

fn meta_content_from_document(document: &Document, name: &str) -> Option<String> {
    document
        .select("meta")
        .iter()
        .find(|node| {
            node.attr("name")
                .map(clean_attr_value)
                .is_some_and(|value| value.eq_ignore_ascii_case(name))
        })
        .and_then(|node| node.attr("content").map(clean_attr_value))
}

fn text_for_first(document: &Document, selector: &str) -> Option<String> {
    document
        .select(selector)
        .iter()
        .next()
        .map(|node| collapse_whitespace(&node.text()))
        .filter(|value| !value.is_empty())
}

fn first_h1_from_document(document: &Document) -> Option<String> {
    text_for_first(document, "h1")
}

fn article_text_from_document(document: &Document) -> String {
    if let Some(article) = document.try_select("article[data-opaline-note]") {
        return collapse_whitespace(&article.formatted_text());
    }
    String::new()
}

fn plain_text_from_document(document: &Document) -> String {
    if let Some(article) = document.try_select("article[data-opaline-note]") {
        return collapse_whitespace(&article.formatted_text());
    }
    if let Some(body) = document.try_select("body") {
        return collapse_whitespace(&body.formatted_text());
    }
    collapse_whitespace(&document.formatted_text())
}

fn replace_existing_meta_content(html: &str, name: &str, content: &str) -> Option<String> {
    let tag = find_start_tag(html, "meta", |attrs| {
        attr_value(attrs, "name").is_some_and(|value| value.eq_ignore_ascii_case(name))
    })?;
    let attrs = parse_tag_attributes(&html[tag.clone()], tag.start);
    let escaped = escape_attr(content);
    if let Some(content_attr) = attrs
        .iter()
        .find(|attr| attr.name.eq_ignore_ascii_case("content"))
    {
        if let Some(range) = &content_attr.value_range {
            let mut output = String::with_capacity(html.len() + escaped.len());
            output.push_str(&html[..range.start]);
            output.push_str(&escaped);
            output.push_str(&html[range.end..]);
            return Some(output);
        }
    }

    let insert_at = if tag.end >= 2 && html.as_bytes()[tag.end - 2] == b'/' {
        tag.end - 2
    } else {
        tag.end - 1
    };
    let mut output = String::with_capacity(html.len() + escaped.len() + 12);
    output.push_str(&html[..insert_at]);
    output.push_str(&format!(" content=\"{escaped}\""));
    output.push_str(&html[insert_at..]);
    Some(output)
}

fn replace_first_element_inner(html: &str, tag_name: &str, replacement: &str) -> Option<String> {
    let open = find_start_tag(html, tag_name, |_| true)?;
    let close_start = find_close_tag(html, tag_name, open.end)?;
    let mut output = String::with_capacity(html.len() + replacement.len());
    output.push_str(&html[..open.end]);
    output.push_str(replacement);
    output.push_str(&html[close_start..]);
    Some(output)
}

fn insert_into_head(html: &str, markup: &str) -> String {
    if let Some(close_head) = find_case_insensitive(html, "</head>") {
        let mut output = String::with_capacity(html.len() + markup.len());
        output.push_str(&html[..close_head]);
        output.push_str(markup);
        output.push_str(&html[close_head..]);
        return output;
    }

    if let Some(html_tag) = find_start_tag(html, "html", |_| true) {
        let mut output = String::with_capacity(html.len() + markup.len() + 16);
        output.push_str(&html[..html_tag.end]);
        output.push_str("\n  <head>\n");
        output.push_str(markup);
        output.push_str("  </head>");
        output.push_str(&html[html_tag.end..]);
        return output;
    }

    format!("<head>\n{markup}</head>\n{html}")
}

fn find_start_tag<F>(html: &str, tag_name: &str, predicate: F) -> Option<Range<usize>>
where
    F: Fn(&[ParsedAttr]) -> bool,
{
    let bytes = html.as_bytes();
    let tag_name = tag_name.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        let Some(relative) = html[index..].find('<') else {
            break;
        };
        let start = index + relative;
        let name_start = start + 1;
        if name_start >= bytes.len()
            || bytes[name_start] == b'/'
            || bytes[name_start] == b'!'
            || bytes[name_start] == b'?'
        {
            index = name_start;
            continue;
        }
        if !ascii_prefix_eq_ignore_case(&bytes[name_start..], tag_name) {
            index = name_start;
            continue;
        }
        let boundary = name_start + tag_name.len();
        if boundary < bytes.len()
            && !matches!(bytes[boundary], b' ' | b'\t' | b'\n' | b'\r' | b'/' | b'>')
        {
            index = name_start;
            continue;
        }
        let Some(end) = find_tag_end(html, start) else {
            return None;
        };
        let range = start..end;
        let attrs = parse_tag_attributes(&html[range.clone()], start);
        if predicate(&attrs) {
            return Some(range);
        }
        index = end;
    }
    None
}

fn find_close_tag(html: &str, tag_name: &str, from: usize) -> Option<usize> {
    let needle = format!("</{}", tag_name.to_ascii_lowercase());
    let lower = html[from..].to_ascii_lowercase();
    let mut offset = 0;
    while let Some(relative) = lower[offset..].find(&needle) {
        let start = from + offset + relative;
        let after_name = start + needle.len();
        if after_name < html.len()
            && matches!(
                html.as_bytes()[after_name],
                b' ' | b'\t' | b'\n' | b'\r' | b'>'
            )
        {
            return Some(start);
        }
        offset += relative + needle.len();
    }
    None
}

fn find_tag_end(html: &str, start: usize) -> Option<usize> {
    let bytes = html.as_bytes();
    let mut quote: Option<u8> = None;
    let mut index = start;
    while index < bytes.len() {
        match (bytes[index], quote) {
            (b'\'' | b'"', None) => quote = Some(bytes[index]),
            (ch, Some(current)) if ch == current => quote = None,
            (b'>', None) => return Some(index + 1),
            _ => {}
        }
        index += 1;
    }
    None
}

fn parse_tag_attributes(tag: &str, absolute_start: usize) -> Vec<ParsedAttr> {
    let bytes = tag.as_bytes();
    let mut attrs = Vec::new();
    let mut index = 1;

    while index < bytes.len() && !matches!(bytes[index], b' ' | b'\t' | b'\n' | b'\r' | b'/' | b'>')
    {
        index += 1;
    }

    while index < bytes.len() {
        while index < bytes.len() && matches!(bytes[index], b' ' | b'\t' | b'\n' | b'\r' | b'/') {
            index += 1;
        }
        if index >= bytes.len() || bytes[index] == b'>' {
            break;
        }
        let name_start = index;
        while index < bytes.len()
            && !matches!(
                bytes[index],
                b' ' | b'\t' | b'\n' | b'\r' | b'=' | b'/' | b'>'
            )
        {
            index += 1;
        }
        let name = tag[name_start..index].to_ascii_lowercase();
        while index < bytes.len() && matches!(bytes[index], b' ' | b'\t' | b'\n' | b'\r') {
            index += 1;
        }
        if index >= bytes.len() || bytes[index] != b'=' {
            attrs.push(ParsedAttr {
                name,
                value: None,
                value_range: None,
            });
            continue;
        }
        index += 1;
        while index < bytes.len() && matches!(bytes[index], b' ' | b'\t' | b'\n' | b'\r') {
            index += 1;
        }
        if index >= bytes.len() {
            attrs.push(ParsedAttr {
                name,
                value: Some(String::new()),
                value_range: Some(absolute_start + index..absolute_start + index),
            });
            break;
        }

        let value_start;
        let value_end;
        if matches!(bytes[index], b'\'' | b'"') {
            let quote = bytes[index];
            index += 1;
            value_start = index;
            while index < bytes.len() && bytes[index] != quote {
                index += 1;
            }
            value_end = index;
            if index < bytes.len() {
                index += 1;
            }
        } else {
            value_start = index;
            while index < bytes.len()
                && !matches!(bytes[index], b' ' | b'\t' | b'\n' | b'\r' | b'/' | b'>')
            {
                index += 1;
            }
            value_end = index;
        }
        attrs.push(ParsedAttr {
            name,
            value: Some(unescape_text(&tag[value_start..value_end])),
            value_range: Some(absolute_start + value_start..absolute_start + value_end),
        });
    }

    attrs
}

fn attr_value(attrs: &[ParsedAttr], name: &str) -> Option<String> {
    attrs
        .iter()
        .find(|attr| attr.name.eq_ignore_ascii_case(name))
        .and_then(|attr| attr.value.clone())
}

fn contains_start_tag(html: &str, tag_name: &str) -> bool {
    find_start_tag(html, tag_name, |_| true).is_some()
}

fn find_case_insensitive(haystack: &str, needle: &str) -> Option<usize> {
    haystack
        .to_ascii_lowercase()
        .find(&needle.to_ascii_lowercase())
}

fn ascii_prefix_eq_ignore_case(value: &[u8], prefix: &[u8]) -> bool {
    value.len() >= prefix.len()
        && value
            .iter()
            .zip(prefix)
            .all(|(left, right)| left.eq_ignore_ascii_case(right))
}

fn normalize_link_kind(kind: Option<&str>) -> Option<String> {
    match kind.map(|value| value.trim().to_lowercase()).as_deref() {
        Some("note" | "file") => Some("note".to_string()),
        Some("heading") => Some("heading".to_string()),
        Some("block") => Some("block".to_string()),
        Some("concept") => Some("concept".to_string()),
        _ => None,
    }
}

pub fn is_block_fragment(fragment: &str) -> bool {
    fragment.starts_with('^')
        || fragment.starts_with("b-")
        || fragment.starts_with("block-")
        || fragment.starts_with("opaline-block-")
}

fn push_unique(values: &mut Vec<String>, value: String) {
    let value = value.trim().to_string();
    if !value.is_empty() && !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

fn clean_attr_value(value: impl ToString) -> String {
    value.to_string().trim().to_string()
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn escape_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_attr(value: &str) -> String {
    escape_text(value).replace('"', "&quot;")
}

fn unescape_text(value: &str) -> String {
    value
        .replace("&quot;", "\"")
        .replace("&#34;", "\"")
        .replace("&#x22;", "\"")
        .replace("&#x27;", "'")
        .replace("&#39;", "'")
        .replace("&gt;", ">")
        .replace("&lt;", "<")
        .replace("&amp;", "&")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parser_handles_meta_order_quotes_and_case() {
        let html = r#"<!doctype html>
<HTML><HEAD>
<meta content='note-1' NAME='opaline:id'>
<META data-x="1" CONTENT="2026-05-14T00:00:00Z" name="opaline:created">
<title>测试 &amp; Title</title>
</HEAD><BODY><ARTICLE data-opaline-note><H1>测试 &amp; Title</H1></ARTICLE></BODY></HTML>"#;

        let metadata = extract_note_metadata(html);

        assert_eq!(metadata.id.as_deref(), Some("note-1"));
        assert_eq!(metadata.created_at.as_deref(), Some("2026-05-14T00:00:00Z"));
        assert_eq!(metadata.title.as_deref(), Some("测试 & Title"));
        assert_eq!(metadata.first_h1.as_deref(), Some("测试 & Title"));
    }

    #[test]
    fn parser_extracts_nested_headings_links_entities_and_opaline_metadata() {
        let html = r#"<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Profile</title>
  </head>
  <body>
    <article data-opaline-note>
      <h2 id="Research-Question">Research <em>Question</em> &amp; Scope</h2>
      <p><span data-opaline-tag='research'>#research</span> #HTML,</p>
      <p>
        <a href="target.html#b-intro" data-opaline-link="note-2" data-opaline-link-kind="block" data-opaline-block-ref="b-intro">
          Intro <strong>block</strong> &amp; notes
        </a>
        <a href="target.html#Research-Question" data-opaline-link-kind="heading" data-opaline-heading="Research Question">heading</a>
        <a href="opaline://concept/RAG" data-opaline-link-kind="concept" data-opaline-concept="RAG">RAG</a>
        <span data-opaline-unresolved="Missing Note">[[Missing Note]]</span>
      </p>
    </article>
  </body>
</html>"#;

        let inspection = inspect_note_html(html);

        assert!(inspection.has_note_article);
        assert_eq!(inspection.headings[0].text, "Research Question & Scope");
        assert!(inspection.tags.contains(&"research".to_string()));
        assert!(inspection.tags.contains(&"HTML".to_string()));
        assert!(inspection.body_text.contains("Intro block & notes"));

        let block = inspection
            .links
            .iter()
            .find(|link| link.kind == "block")
            .unwrap();
        assert_eq!(block.href, "target.html#b-intro");
        assert_eq!(block.target_id.as_deref(), Some("note-2"));
        assert_eq!(block.target_block_id.as_deref(), Some("b-intro"));

        let heading = inspection
            .links
            .iter()
            .find(|link| link.kind == "heading")
            .unwrap();
        assert_eq!(heading.target_heading.as_deref(), Some("Research Question"));

        let concept = inspection
            .links
            .iter()
            .find(|link| link.kind == "concept")
            .unwrap();
        assert_eq!(concept.concept.as_deref(), Some("RAG"));

        let unresolved = inspection
            .links
            .iter()
            .find(|link| link.unresolved)
            .unwrap();
        assert!(unresolved.is_broken);
        assert_eq!(unresolved.label, "Missing Note");
    }

    #[test]
    fn first_heading_content_uses_first_matching_h1_only() {
        let html = r#"<!doctype html>
<html><head><title>Title</title></head>
<body><article data-opaline-note>
<h1>First <em>Heading</em></h1>
<h1>Second Heading</h1>
</article></body></html>"#;

        assert_eq!(
            first_heading_content(html).as_deref(),
            Some("First Heading")
        );
    }

    #[test]
    fn target_inventory_does_not_treat_block_ref_as_a_target() {
        let html = r#"<!doctype html>
<html><head><title>Blocks</title></head>
<body><article data-opaline-note>
<p data-opaline-block-ref="referenced-elsewhere">Link-side reference metadata</p>
<p data-opaline-block-id="real-block">Real block target</p>
<section id="section-block" data-opaline-block>Section block target</section>
</article></body></html>"#;

        let inspection = inspect_note_html(html);

        assert!(!inspection
            .target_inventory
            .block_ids
            .contains(&"referenced-elsewhere".to_string()));
        assert!(inspection
            .target_inventory
            .block_ids
            .contains(&"real-block".to_string()));
        assert!(inspection
            .target_inventory
            .block_ids
            .contains(&"section-block".to_string()));
    }

    #[test]
    fn writer_helpers_update_meta_title_and_h1_without_full_document_rewrite() {
        let html = r#"<!doctype html>
<html>
  <head>
    <meta content='old-id' name='opaline:id'>
    <title>Old <em>ignored</em></title>
  </head>
  <body>
    <article data-opaline-note>
      <h1 data-x="1">Old <span>Title</span></h1>
      <p>Body</p>
    </article>
  </body>
</html>"#;

        let updated = upsert_meta_content(html, "opaline:id", "new-id");
        assert!(updated.contains("content='new-id' name='opaline:id'"));

        let titled = replace_title_text(&updated, "New & Title");
        assert!(titled.contains("<title>New &amp; Title</title>"));

        let h1 = replace_first_h1_if_text_matches(&titled, "Old Title", "New & Title");
        assert!(h1.contains(r#"<h1 data-x="1">New &amp; Title</h1>"#));
        assert!(h1.contains("<p>Body</p>"));
    }

    #[test]
    fn normalize_updated_meta_compare_handles_attribute_order_and_quotes() {
        let left = r#"<meta content='2026-01-01T00:00:00Z' name='opaline:updated'>"#;
        let right = r#"<meta name='opaline:updated' content='2026-01-02T00:00:00Z'>"#;

        assert_eq!(
            normalize_updated_meta_for_compare(left),
            r#"<meta content='__opaline_updated__' name='opaline:updated'>"#
        );
        assert_eq!(
            normalize_updated_meta_for_compare(right),
            r#"<meta name='opaline:updated' content='__opaline_updated__'>"#
        );
    }
}
