const $ = require("jquery");

$(() => {
  $("form#prospect-form").on("submit", (evt) => {
    evt.preventDefault();
    const $btn = $("button#prospect");
    const domains = $("#domains")
      .val()
      .split("\n")
      .map(d => d.trim())
      .filter(d => d.length > 0)
      .sort();

    if (domains.length > 0) {
      const data = { domains };
      $btn.text("Prospecting...").attr("disabled", true);
      ["role", "seniority", "titles"].forEach(k => {
        const val = $(`#${k}`).val().trim();
        if (val && val.length > 0) {
          data[k] = val;
        }
      });

      if (data.tiles && data.titles.length > 0) {
        data.titles = data.titles.split(",").map(t => t.trim());
      }

      $.ajax({
        type: "POST",
        url: `/prospect${document.location.search}`,
        data,
        dataType: "json"
      }).then(
        () => $btn.text("Prospect").prop("disabled", false),
        err => {
          $btn.val(`Oops: ${err.toString()}`).prop("disabled", false);
        }
      );
    }
  });
});
