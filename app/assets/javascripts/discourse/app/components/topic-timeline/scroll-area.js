import GlimmerComponent from "discourse/components/glimmer";
import { bind } from "discourse-common/utils/decorators";
import { tracked } from "@glimmer/tracking";
import discourseLater from "discourse-common/lib/later";
import { action } from "@ember/object";

export const SCROLLER_HEIGHT = 50;
const MIN_SCROLLAREA_HEIGHT = 170;
const MAX_SCROLLAREA_HEIGHT = 300;

export default class TopicTimelineScrollArea extends GlimmerComponent {
  @tracked showButton = false;
  @tracked scrollPosition;
  @tracked current;
  @tracked percentage = this._percentFor(
    this.args.topic,
    this.args.enteredIndex + 1
  );
  @tracked total;
  @tracked date;
  @tracked lastRead = null;
  @tracked lastReadPercentage = null;
  @tracked position;

  buildKey = `timeline-scrollarea-${this.args.topic.id}`;
  style = `height: ${scrollareaHeight()}px`;
  before = this.scrollareaRemaining() * this.percentage;
  after = scrollareaHeight() - this.args.before - SCROLLER_HEIGHT;

  get lastReadTop() {
    return Math.round(this.lastReadPercentage * scrollareaHeight());
  }

  get hasBackPosition() {
    return (
      this.lastRead &&
      this.lastRead > 3 &&
      this.lastRead > this.current &&
      Math.abs(this.lastRead - this.current) > 3 &&
      Math.abs(this.lastRead - this.total) > 1 &&
      this.lastRead !== this.total
    );
  }

  constructor() {
    super(...arguments);

    this.calculatePosition();
    if (this.percentage === null) {
      return;
    }

    this.before = this.scrollareaRemaining() * this.percentage;

    if (this.hasBackPosition) {
      const lastReadTop = Math.round(
        this.lastReadPercentage * scrollareaHeight()
      );
      showButton =
        before + SCROLLER_HEIGHT - 5 < lastReadTop || before > lastReadTop + 25;
      this.showButton = showButton;
    }

    if (this.hasBackPosition) {
      const lastReadTop = Math.round(
        this.lastReadPercentage * scrollareaHeight()
      );
      this.lastReadTop = lastReadTop;
    }
  }

  @bind
  calculatePosition() {
    const topic = this.args.topic;
    const postStream = topic.get("postStream");
    this.total = postStream.get("filteredPostsCount");

    this.scrollPosition =
      this.clamp(Math.floor(this.total * this.percentage), 0, this.total) + 1;
    this.current = this.clamp(this.scrollPosition, 1, this.total);
    const daysAgo = postStream.closestDaysAgoFor(this.current);

    if (daysAgo === undefined) {
      const post = postStream
        .get("posts")
        .findBy("id", postStream.get("stream")[this.current]);

      if (post) {
        this.date = new Date(post.get("created_at"));
      }
    } else if (daysAgo !== null) {
      let date = new Date();
      this.date = date.setDate(date.getDate() - daysAgo || 0);
    } else {
      this.date = null;
    }

    const lastReadId = topic.last_read_post_id;
    const lastReadNumber = topic.last_read_post_number;

    if (lastReadId && lastReadNumber) {
      const idx = postStream.get("stream").indexOf(lastReadId) + 1;
      this.read = idx;
      this.lastReadPercentage = this._percentFor(topic, idx);
    }

    if (this.position !== this.scrollPosition) {
      this.updateScrollPosition(this.current);
    }
  }

  @bind
  updateScrollPosition(scrollPosition) {
    if (!this.args.fullscreen) {
      return;
    }

    this.position = scrollPosition;
    this.excerpt = "";

    const stream = this.args.topic.get("postStream");

    // a little debounce to avoid flashing
    discourseLater(() => {
      if (!this.position === scrollPosition) {
        return;
      }

      // we have an off by one, stream is zero based,
      stream.excerpt(scrollPosition - 1).then((info) => {
        if (info && this.position === scrollPosition) {
          let excerpt = "";

          if (info.username) {
            excerpt = "<span class='username'>" + info.username + ":</span> ";
          }

          if (info.excerpt) {
            this.excerpt = excerpt + info.excerpt;
          } else if (info.action_code) {
            this.state.excerpt = `${excerpt} ${actionDescriptionHtml(
              info.action_code,
              info.created_at,
              info.username
            )}`;
          }

          this.scheduleRerender();
        }
      });
    }, 50);
  }

  commit() {
    this.calculatePosition();

    if (this.current === this.scrollPosition) {
      this.sendWidgetAction("jumpToIndex", this.current);
    } else {
      this.sendWidgetAction("jumpEnd");
    }
  }

  topicCurrentPostScrolled(event) {
    this.state.percentage = event.percent;
  }

  _percentFor(topic, postIndex) {
    const total = topic.get("postStream.filteredPostsCount");
    return this.clamp(parseFloat(postIndex - 1.0) / total);
  }

  goBack() {
    this.sendWidgetAction("jumpToIndex", this.position().lastRead);
  }

  @bind
  clamp(p, min = 0.0, max = 1.0) {
    return Math.max(Math.min(p, max), min);
  }

  @action
  updatePercentage(y) {
    const $area = $(".timeline-scrollarea");
    const areaTop = $area.offset().top;

    const percentage = this.clamp(parseFloat(y - areaTop) / $area.height());

    this.percentage = percentage;
  }

  scrollareaRemaining() {
    return scrollareaHeight() - SCROLLER_HEIGHT;
  }
}

export function scrollareaHeight() {
  const composerHeight =
      document.getElementById("reply-control").offsetHeight || 0,
    headerHeight = document.querySelectorAll(".d-header")[0].offsetHeight || 0;

  // scrollarea takes up about half of the timeline's height
  const availableHeight =
    (window.innerHeight - composerHeight - headerHeight) / 2;

  return Math.max(
    MIN_SCROLLAREA_HEIGHT,
    Math.min(availableHeight, MAX_SCROLLAREA_HEIGHT)
  );
}
